# Keep classes referenced by reflection in kotlinx.serialization.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class de.moviebox.**$$serializer { *; }
-keepclassmembers class de.moviebox.** {
    *** Companion;
}
-keepclasseswithmembers class de.moviebox.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Retrofit uses reflection on service interfaces.
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response

# OkHttp sometimes complains about missing optional classes - these can go.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
