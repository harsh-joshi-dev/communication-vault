import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {Message} from '../../types';
import {format} from 'date-fns';
import {chatService} from '../../services/ChatService';
import {deviceService} from '../../services/DeviceService';
import {chatStorageService} from '../../services/ChatStorageService';
import {launchImageLibrary} from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import {mediaService} from '../../services/MediaService';

const ChatDetailScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {chatId, contactName, receiverId, receiverUniqueCode, phoneNumber, email, isAppUser} = route.params as {
    chatId: string;
    contactName: string;
    receiverId?: string | null;
    receiverUniqueCode?: string;
    phoneNumber?: string;
    email?: string;
    isAppUser?: boolean;
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | undefined>();
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{[key: string]: number}>({});
  const [audioDuration, setAudioDuration] = useState<{[key: string]: number}>({});
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;

  useEffect(() => {
    // Get current device ID
    deviceService.getDeviceId().then(id => setCurrentDeviceId(id));
    
    // Connect chat service with device ID
    chatService.connect().then(() => {
      console.log('Chat service connected successfully');
      // After connection, setup listeners and join chat
      setupMessageListener();
      setupTypingListener();
      setupStatusUpdateListener();
      joinChat();
    }).catch((error) => {
      console.error('Failed to connect chat service:', error);
      // Retry connection after a delay
      setTimeout(() => {
        chatService.connect().then(() => {
          setupMessageListener();
          setupTypingListener();
          setupStatusUpdateListener();
          joinChat();
        }).catch(err => console.error('Retry connection failed:', err));
      }, 3000);
    });
    
    // Mark chat as read when opening
    chatStorageService.markChatAsRead(chatId);
    
    // Load messages
    loadMessages();

    return () => {
      chatService.onMessage(() => {})(); // Cleanup
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      // Stop any playing audio
      if (playingMessageId) {
        audioRecorderPlayer.stopPlayer();
      }
    };
  }, []);

  const joinChat = () => {
    const socket = (chatService as any).socketInstance;
    if (socket?.connected && chatId) {
      socket.emit('join_chat', {chatId});
    }
  };

  const setupTypingListener = () => {
    const socket = (chatService as any).socketInstance;
    if (!socket) return;
    
    socket.on('user_typing', async (data: {deviceId: string; deviceName: string; chatId: string; isTyping: boolean}) => {
      const currentDevice = await deviceService.getDeviceId();
      if (data.chatId === chatId && data.deviceId !== currentDevice) {
        setIsTyping(data.isTyping);
        setTypingUser(data.isTyping ? data.deviceName : null);
        
        // Auto-hide typing after 3 seconds
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        if (data.isTyping) {
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
            setTypingUser(null);
          }, 3000);
        }
      }
    });
  };

  const setupStatusUpdateListener = () => {
    const socket = (chatService as any).socketInstance;
    if (!socket) return;
    
    socket.on('message_status_update', (data: {messageId: string; status: string; deliveredAt?: string; readAt?: string}) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === data.messageId) {
          return {
            ...msg,
            status: data.status as any,
            deliveredAt: data.deliveredAt,
            readAt: data.readAt,
          };
        }
        return msg;
      }));
    });

    socket.on('messages_read', (data: {chatId: string; messageIds: string[]; readAt: string}) => {
      if (data.chatId === chatId) {
        setMessages(prev => prev.map(msg => {
          if (data.messageIds.includes(msg.id)) {
            return {
              ...msg,
              status: 'read' as any,
              readAt: data.readAt,
            };
          }
          return msg;
        }));
      }
    });
  };

  const handleTyping = (text: string) => {
    setInputText(text);
    
    const socket = (chatService as any).socketInstance;
    if (!socket?.connected || !chatId) return;
    
    // Emit typing indicator
    socket.emit('typing', {
      chatId,
      isTyping: text.length > 0,
    });
  };

  const handleCall = () => {
    Alert.alert('Call', `Calling ${contactName}...`);
    // TODO: Implement actual call functionality
  };

  const handleVideoCall = () => {
    Alert.alert('Video Call', `Starting video call with ${contactName}...`);
    // TODO: Implement actual video call functionality
  };

  const loadMessages = async () => {
    try {
      const msgs = await chatService.getMessages(chatId);
      // Filter out deleted messages and sort
      const visibleMessages = msgs
        .filter(msg => !msg.isDeleted)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(visibleMessages);
      scrollToBottom();
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const setupMessageListener = () => {
    chatService.onMessage((message: Message) => {
      if (message.chatId === chatId) {
        if (message.isDeleted) {
          // Remove deleted message from UI (immediate update)
          setMessages(prev => prev.filter(msg => msg.id !== message.id));
          return;
        }
        
        // Optimistic UI update (immediate, non-blocking)
        setMessages(prev => {
          // Check if message already exists (avoid duplicates)
          const exists = prev.find(msg => msg.id === message.id);
          if (exists) {
            // Update existing message
            return prev.map(msg => msg.id === message.id ? message : msg);
          }
          // Add new message and sort
          const updated = [...prev, message].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          return updated;
        });
        
        // Scroll to bottom immediately
        requestAnimationFrame(() => scrollToBottom());
        
        // Update chat storage (non-blocking for speed)
        chatStorageService.updateChatWithMessage(chatId, message).catch(err => 
          console.error('Error updating chat:', err)
        );
      }
    });
  };

  const scrollToBottom = () => {
    // Use requestAnimationFrame for ultra-smooth scrolling
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({animated: true});
    });
  };

  const handleSendText = async () => {
    if (!inputText.trim()) return;

    const messageText = inputText.trim();
    setInputText('');
    
    // Stop typing indicator
    const socket = (chatService as any).socketInstance;
    if (socket?.connected && chatId) {
      socket.emit('typing', {chatId, isTyping: false});
    }

    // Add message optimistically with pending status
    const tempMessageId = `temp_${Date.now()}`;
    const tempMessage: Message = {
      id: tempMessageId,
      chatId,
      senderId: currentDeviceId || '',
      receiverId: receiverUniqueCode || receiverId || '',
      type: 'text',
      content: messageText,
      status: 'sending',
      isViewOnce: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, tempMessage]);
    scrollToBottom();

    // Send message (never throws errors - always succeeds optimistically)
    chatService.sendMessage(
      chatId,
      receiverId || undefined,
      'text',
      messageText,
      undefined,
      {
        phoneNumber,
        contactName,
        email,
        isAppUser: isAppUser ?? false,
        receiverUniqueCode: receiverUniqueCode,
      },
    ).then((sentMessage) => {
      // Replace temp message with real message (or add if not found)
      setMessages(prev => {
        const exists = prev.find(msg => msg.id === tempMessageId);
        if (exists) {
          return prev.map(msg => 
            msg.id === tempMessageId ? {...sentMessage, status: sentMessage.status || 'sent'} : msg
          );
        }
        // If temp message not found, add the sent message
        return [...prev, {...sentMessage, status: sentMessage.status || 'sent'}].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
      
      // Update chat storage with new message (for ChatsScreen)
      chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
        console.error('Error updating chat:', err)
      );
      
      scrollToBottom();
      
      // Mark messages as read if receiver is viewing
      if (receiverId) {
        setTimeout(() => {
          chatService.markAsRead(chatId, [sentMessage.id]);
        }, 1000);
      }
    }).catch((error: any) => {
      // Even if there's an error, keep the message (optimistic)
      console.warn('Message send warning (message kept locally):', error?.message);
      // Update status to show it's pending
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessageId ? {...msg, status: 'pending'} : msg
      ));
    });
  };

  const handleSendImage = async () => {
    try {
      launchImageLibrary(
        {
          mediaType: 'photo',
          quality: 0.8,
        },
        async response => {
          if (response.assets && response.assets[0]) {
            const asset = response.assets[0];
            try {
              const sentMessage = await chatService.sendMessage(
                chatId,
                receiverId || undefined,
                'image',
                asset.fileName || 'image.jpg',
                asset.uri,
                {
                  fileName: asset.fileName,
                  fileSize: asset.fileSize,
                  isAppUser: isAppUser ?? false,
                  phoneNumber,
                  contactName,
                  email,
                },
              );
              await chatStorageService.updateChatWithMessage(chatId, sentMessage);
              scrollToBottom();
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to send image');
            }
          }
        },
      );
    } catch (error) {
      console.error('Error sending image:', error);
    }
  };

  const handleSendVideo = async () => {
    try {
      launchImageLibrary(
        {
          mediaType: 'video',
          quality: 0.8,
        },
        async response => {
          if (response.assets && response.assets[0]) {
            const asset = response.assets[0];
            // Send video (never throws errors)
            chatService.sendMessage(
              chatId,
              receiverId || undefined,
              'video',
              asset.fileName || 'video.mp4',
              asset.uri,
              {
                fileName: asset.fileName,
                fileSize: asset.fileSize,
                duration: asset.duration,
                isAppUser: isAppUser ?? false,
                phoneNumber,
                contactName,
                email,
                receiverUniqueCode: receiverUniqueCode,
              },
            ).then((sentMessage) => {
              chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
                console.error('Error updating chat:', err)
              );
              scrollToBottom();
            }).catch((error: any) => {
              console.warn('Video send warning (saved locally):', error?.message);
            });
          }
        },
      );
    } catch (error) {
      console.error('Error sending video:', error);
    }
  };

  const handleSendDocument = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });

      if (result.length > 0) {
        const file = result[0];
        // Send document (never throws errors)
        chatService.sendMessage(
          chatId,
          receiverId || undefined,
          'document',
          file.name || 'document',
          file.uri,
          {
            fileName: file.name,
            fileSize: file.size,
            isAppUser: isAppUser ?? false,
            phoneNumber,
            contactName,
            email,
            receiverUniqueCode: receiverUniqueCode,
          },
        ).then((sentMessage) => {
          chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
            console.error('Error updating chat:', err)
          );
          scrollToBottom();
        }).catch((error: any) => {
          console.warn('Document send warning (saved locally):', error?.message);
        });
      }
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        console.error('Error sending document:', error);
      }
    }
  };

  const startRecording = async () => {
    try {
      // Request permissions
      const audioSet = {
        AudioEncoderAndroid: 3,
        AudioSourceAndroid: 1,
        AVEncoderAudioQualityKeyIOS: 'high',
        AVNumberOfChannelsKeyIOS: 2,
        AVFormatIDKeyIOS: 'm4a',
      };
      
      const uri = await audioRecorderPlayer.startRecorder(undefined, audioSet);
      setIsRecording(true);
      setRecordingTime(0);

      // Update recording time every second
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = async () => {
    try {
      const result = await audioRecorderPlayer.stopRecorder();
      setIsRecording(false);
      const duration = recordingTime;

      // Clear recording interval
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      if (result && duration > 0) {
        // Send voice message (never throws errors)
        chatService.sendMessage(
          chatId,
          receiverId || undefined,
          'voice',
          `Voice message ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
          result,
          {
            duration,
            autoDeleteAfter: 24,
            isAppUser: isAppUser ?? false,
            phoneNumber,
            contactName,
            email,
            receiverUniqueCode: receiverUniqueCode,
          },
        ).then((sentMessage) => {
          chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
            console.error('Error updating chat:', err)
          );
        }).catch((error: any) => {
          console.warn('Voice message send warning (saved locally):', error?.message);
        });
      }

      setRecordingTime(0);
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const toggleAudioPlayback = async (message: Message) => {
    try {
      if (!message.mediaUrl) {
        Alert.alert('Error', 'Audio file not available');
        return;
      }

      // If this message is already playing, pause it
      if (playingMessageId === message.id) {
        await audioRecorderPlayer.pausePlayer();
        setPlayingMessageId(null);
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
        return;
      }

      // Stop any currently playing audio
      if (playingMessageId) {
        await audioRecorderPlayer.stopPlayer();
        setAudioProgress(prev => ({...prev, [playingMessageId]: 0}));
      }

      // Get full URL for audio
      const getBaseUrl = () => {
        if (__DEV__) {
          return Platform.OS === 'android' ? 'http://192.168.1.16:5001' : 'http://localhost:5001';
        }
        return 'https://communication-vault.onrender.com';
      };
      
      const audioUrl = message.mediaUrl?.startsWith('http') 
        ? message.mediaUrl 
        : `${getBaseUrl()}${message.mediaUrl}`;

      // Start playing
      const msg = await audioRecorderPlayer.startPlayer(audioUrl);
      setPlayingMessageId(message.id);
      
      // Get duration
      const duration = await audioRecorderPlayer.getDuration();
      setAudioDuration(prev => ({...prev, [message.id]: duration}));

      // Update progress
      playbackIntervalRef.current = setInterval(async () => {
        const position = await audioRecorderPlayer.getCurrentPosition();
        setAudioProgress(prev => ({...prev, [message.id]: position}));
        
        // Check if finished
        if (position >= duration) {
          setPlayingMessageId(null);
          setAudioProgress(prev => ({...prev, [message.id]: 0}));
          if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
          }
        }
      }, 100);

      // Handle playback finish
      audioRecorderPlayer.addRecordBackListener((e: any) => {
        if (e.currentPosition >= e.duration) {
          setPlayingMessageId(null);
          setAudioProgress(prev => ({...prev, [message.id]: 0}));
          if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
          }
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio');
      setPlayingMessageId(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
      case 'sending':
        return <Icon name="time-outline" size={14} color="#999" />;
      case 'sent':
        return <Icon name="checkmark" size={14} color="#999" />;
      case 'delivered':
        return <Icon name="checkmark-done" size={14} color="#999" />;
      case 'read':
        return <Icon name="checkmark-done" size={14} color="#4FC3F7" />;
      default:
        return <Icon name="time-outline" size={14} color="#999" />;
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteMessage(chatId, messageId);
              setMessages(prev => prev.filter(msg => msg.id !== messageId));
              // Also update chat storage
              const updatedMessages = await messageStorageService.getMessages(chatId);
              const lastMessage = updatedMessages[updatedMessages.length - 1];
              if (lastMessage) {
                await chatStorageService.updateChatWithMessage(chatId, lastMessage);
              }
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert('Error', 'Failed to delete message');
            }
          },
        },
      ],
    );
  };

  const renderMessage = ({item}: {item: Message}) => {
    if (item.isDeleted) {
      return null; // Don't render deleted messages
    }
    
    const isMe = item.senderId === currentDeviceId;
    const isViewOnce = item.isViewOnce && item.readAt;

    return (
      <TouchableOpacity
        style={[
          styles.messageContainer,
          isMe ? styles.myMessage : styles.theirMessage,
        ]}
        onLongPress={() => handleDeleteMessage(item.id)}
        activeOpacity={0.7}>
        {!isMe && otherUserAvatar && (
          <Image source={{uri: otherUserAvatar}} style={styles.messageAvatar} />
        )}
        
        <View style={styles.messageContent}>
          {item.type === 'text' && (
            <Text
              style={[
                styles.messageText,
                isMe ? styles.myMessageText : styles.theirMessageText,
              ]}>
              {item.content}
            </Text>
          )}

        {item.type === 'image' && item.mediaUrl && (
          <Image 
            source={{uri: item.mediaUrl}} 
            style={styles.messageImage} 
          />
        )}

        {item.type === 'video' && item.mediaUrl && (
          <TouchableOpacity 
            style={styles.videoContainer}
            onPress={() => {
              // TODO: Open video player
              Alert.alert('Video', 'Video playback coming soon');
            }}>
            {item.thumbnailUrl ? (
              <Image 
                source={{uri: item.thumbnailUrl}} 
                style={styles.videoThumbnail} 
              />
            ) : (
              <View style={[styles.videoThumbnail, {backgroundColor: '#000', justifyContent: 'center', alignItems: 'center'}]}>
                <Icon name="videocam" size={40} color="#fff" />
              </View>
            )}
            <View style={styles.videoOverlay}>
              <Icon name="play-circle" size={40} color="#fff" />
              {item.duration && (
                <Text style={styles.videoDuration}>
                  {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {item.type === 'voice' && (
          <TouchableOpacity 
            style={styles.voiceMessage}
            onPress={() => toggleAudioPlayback(item)}
            activeOpacity={0.7}>
            <Icon 
              name={playingMessageId === item.id ? "pause-circle" : "play-circle"} 
              size={32} 
              color={isMe ? '#075E54' : '#34B7F1'} 
            />
            <View style={styles.voiceMessageContent}>
              <View style={styles.voiceProgressContainer}>
                <View 
                  style={[
                    styles.voiceProgressBar,
                    {
                      width: `${audioProgress[item.id] && audioDuration[item.id] 
                        ? (audioProgress[item.id] / audioDuration[item.id]) * 100 
                        : 0}%`,
                      backgroundColor: isMe ? '#075E54' : '#34B7F1',
                    }
                  ]} 
                />
              </View>
              <Text
                style={[
                  styles.voiceText,
                  isMe ? styles.myMessageText : styles.theirMessageText,
                ]}>
                {audioProgress[item.id] && audioDuration[item.id]
                  ? formatDuration(audioProgress[item.id])
                  : item.duration
                  ? formatDuration(item.duration)
                  : '0:00'}
              </Text>
            </View>
            <Icon 
              name="waveform" 
              size={20} 
              color={isMe ? '#075E54' : '#34B7F1'} 
              style={styles.voiceWaveIcon}
            />
          </TouchableOpacity>
        )}

        {item.type === 'document' && (
          <View style={styles.documentMessage}>
            <Icon name="document" size={24} color={isMe ? '#075E54' : '#075E54'} />
            <Text
              style={[
                styles.documentText,
                isMe ? styles.myMessageText : styles.theirMessageText,
              ]}
              numberOfLines={1}>
              {item.fileName || 'Document'}
            </Text>
            {item.fileSize && (
              <Text style={styles.fileSizeText}>
                {(item.fileSize / 1024).toFixed(1)} KB
              </Text>
            )}
          </View>
        )}

          <View style={styles.messageFooter}>
            <Text style={styles.messageTime}>
              {format(new Date(item.createdAt), 'HH:mm')}
            </Text>
            {isMe && (
              <View style={styles.statusIcon}>
                {getStatusIcon(item.status)}
              </View>
            )}
            {item.isViewOnce && !item.readAt && (
              <Icon name="eye" size={12} color="#999" style={styles.viewOnceIcon} />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#075E54" />
      {/* WhatsApp-style Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => {
              // TODO: Open profile
            }}>
            {otherUserAvatar ? (
              <Image source={{uri: otherUserAvatar}} style={styles.headerAvatar} />
            ) : (
              <Icon name="person-circle" size={40} color="#fff" />
            )}
          </TouchableOpacity>
          <View style={styles.nameContainer}>
            <Text style={styles.headerName} numberOfLines={1}>
              {contactName}
            </Text>
            <Text style={styles.headerStatus} numberOfLines={1}>
              {isTyping && typingUser ? `${typingUser} is typing...` : (isAppUser ? 'online' : 'tap to add to contacts')}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleVideoCall}>
          <Icon name="videocam" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleCall}>
          <Icon name="call" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => Alert.alert('Menu', 'More options')}>
          <Icon name="ellipsis-vertical" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View style={styles.messagesContainer}>
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Start the conversation</Text>
          </View>
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={scrollToBottom}
            />
            {isTyping && typingUser && (
              <View style={styles.typingIndicator}>
                <View style={styles.typingBubble}>
                  <View style={styles.typingDot} />
                  <View style={[styles.typingDot, styles.typingDotDelay1]} />
                  <View style={[styles.typingDot, styles.typingDotDelay2]} />
                </View>
                <Text style={styles.typingText}>{typingUser} is typing...</Text>
              </View>
            )}
          </>
        )}
      </View>

      {isRecording ? (
        <View style={styles.recordingContainer}>
          <TouchableOpacity
            style={styles.stopButton}
            onPress={stopRecording}>
            <Icon name="stop" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.recordingTime}>
            {Math.floor(recordingTime / 60)}:
            {(recordingTime % 60).toString().padStart(2, '0')}
          </Text>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handleSendImage}>
            <Icon name="image" size={24} color="#2196F3" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.attachButton}
            onPress={handleSendVideo}>
            <Icon name="videocam" size={24} color="#2196F3" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.attachButton}
            onPress={handleSendDocument}>
            <Icon name="document-attach" size={24} color="#2196F3" />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={handleTyping}
            placeholder="Type a message..."
            multiline
            onSubmitEditing={handleSendText}
          />

          {inputText.trim() ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendText}>
              <Icon name="send" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.voiceButton}
              onPressIn={startRecording}
              onPressOut={stopRecording}>
              <Icon name="mic" size={24} color="#2196F3" />
            </TouchableOpacity>
          )}
        </View>
      )}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECE5DD',
  },
  chatContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#075E54',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
    marginRight: 5,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 5,
  },
  avatarContainer: {
    marginRight: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  messageAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 2,
    backgroundColor: '#ddd',
  },
  messageContent: {
    flex: 1,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  statusIcon: {
    marginLeft: 4,
  },
  nameContainer: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerStatus: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.8,
    marginTop: 2,
  },
  headerButton: {
    padding: 8,
    marginLeft: 5,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 15,
  },
  messageContainer: {
    maxWidth: '75%',
    marginBottom: 10,
    padding: 12,
    borderRadius: 16,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
    borderTopRightRadius: 0,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderTopLeftRadius: 0,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#000',
  },
  theirMessageText: {
    color: '#000',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 5,
  },
  videoContainer: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 5,
    position: 'relative',
    overflow: 'hidden',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    color: '#fff',
    fontSize: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  voiceMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
    maxWidth: 250,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  voiceMessageContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  voiceProgressContainer: {
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 1,
    marginBottom: 4,
    overflow: 'hidden',
  },
  voiceProgressBar: {
    height: '100%',
    backgroundColor: '#075E54',
    borderRadius: 1,
  },
  voiceText: {
    fontSize: 14,
    fontWeight: '500',
  },
  voiceWaveIcon: {
    marginLeft: 4,
  },
  documentMessage: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentText: {
    marginLeft: 10,
    fontSize: 16,
    flex: 1,
  },
  fileSizeText: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    marginLeft: 34,
  },
  messageTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 5,
    alignSelf: 'flex-end',
  },
  viewOnceIcon: {
    marginLeft: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 10,
    backgroundColor: '#F0F0F0',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  attachButton: {
    padding: 8,
    marginRight: 5,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    fontSize: 15,
    marginRight: 5,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#075E54',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#F44336',
  },
  stopButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  recordingTime: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 8,
    alignItems: 'center',
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#999',
    marginHorizontal: 2,
  },
  typingDotDelay1: {
    animationDelay: '0.2s',
  },
  typingDotDelay2: {
    animationDelay: '0.4s',
  },
  typingText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});

export default ChatDetailScreen;

