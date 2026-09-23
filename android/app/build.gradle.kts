plugins {
    id("com.android.application")
}

android {
    namespace = "com.loktron.tronpay"
    compileSdk = 35

    val webAppUrlProvider = providers.gradleProperty("webAppUrl")
        .orElse(providers.environmentVariable("DIGIRUPEE_WEB_APP_URL"))
        .orElse("https://emoney-production-3e0a.up.railway.app/")

    fun quoted(value: String): String {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    }

    defaultConfig {
        applicationId = "com.loktron.tronpay"
        minSdk = 24
        targetSdk = 35
        versionCode = 11
        versionName = "1.1.3"
        buildConfigField("String", "WEB_APP_URL", quoted(webAppUrlProvider.get()))
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
