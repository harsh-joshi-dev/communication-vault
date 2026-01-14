import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

const NotesAppScreen: React.FC = () => {
  const {currentTheme, checkUnlockTrigger, unlock} = useTheme();
  const [notes, setNotes] = useState<string[]>(['Sample note 1', 'Sample note 2']);
  const [newNote, setNewNote] = useState('');
  const [longPressStart, setLongPressStart] = useState<number | null>(null);

  const handleLongPress = () => {
    const startTime = Date.now();
    setLongPressStart(startTime);

    const checkUnlock = () => {
      const duration = Date.now() - startTime;
      const triggerData = {
        duration,
        element: 'header',
      };

      if (checkUnlockTrigger(triggerData)) {
        Alert.prompt(
          'Enter Password',
          'Enter your app password to continue',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Unlock',
              onPress: (password) => {
                if (password) unlock();
                setLongPressStart(null);
              },
            },
          ],
          'secure-text',
        );
      }
    };

    setTimeout(checkUnlock, 5000);
  };

  const handleAddNote = () => {
    if (newNote.trim()) {
      setNotes([...notes, newNote]);
      setNewNote('');
    }
  };

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View
          style={styles.header}
          onTouchStart={handleLongPress}
          onTouchEnd={() => setLongPressStart(null)}>
          <Icon name="document-text" size={60} color={currentTheme.color} />
          <Text style={styles.title}>Notes & To-Do</Text>
          <Text style={styles.subtitle}>Organize your thoughts</Text>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Add a new note..."
            value={newNote}
            onChangeText={setNewNote}
            multiline
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddNote}>
            <Icon name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.notesContainer}>
          {notes.map((note, index) => (
            <View key={index} style={styles.noteCard}>
              <Text style={styles.noteText}>{note}</Text>
              <TouchableOpacity
                onPress={() => {
                  const updated = notes.filter((_, i) => i !== index);
                  setNotes(updated);
                }}>
                <Icon name="trash" size={20} color="#F44336" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    minHeight: 40,
  },
  addButton: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  notesContainer: {
    marginTop: 10,
  },
  noteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  noteText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
});

export default NotesAppScreen;

