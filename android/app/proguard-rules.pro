# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# React Native
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}
-keepclassmembers class * {
  @react-native-community.slider.** *;
}
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep React Native classes
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.views.** { *; }

# Keep all React Native packages
-keep class com.swmansion.** { *; }
-keep class com.reactnativecommunity.** { *; }
-keep class com.dooboolab.** { *; }
-keep class com.ocetnik.** { *; }
-keep class com.rnbiometrics.** { *; }

# Keep all native modules
-keep class * extends com.facebook.react.ReactPackage { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }

# Keep annotations
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Exceptions

# Keep Parcelable
-keepclassmembers class * implements android.os.Parcelable {
  public static final android.os.Parcelable$Creator CREATOR;
}

# Keep Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Keep enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Keep WebRTC
-keep class org.webrtc.** { *; }

# Keep Socket.io
-keep class io.socket.** { *; }

# Keep all React Native vector icons
-keep class com.oblador.vectoricons.** { *; }

# Keep all image libraries
-keep class com.facebook.imagepipeline.** { *; }
-keep class com.facebook.drawee.** { *; }

# Don't warn about missing classes
-dontwarn javax.annotation.**
-dontwarn javax.inject.**
-dontwarn sun.misc.Unsafe

# Keep Kotlin metadata
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings {
    <fields>;
}
-keepclassmembers class kotlin.Metadata {
    public <methods>;
}

# Keep all React Native modules
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * extends com.facebook.react.bridge.BaseJavaModule { *; }
-keep class * extends com.facebook.react.uimanager.SimpleViewManager { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }

# Preserve line numbers for debugging
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

