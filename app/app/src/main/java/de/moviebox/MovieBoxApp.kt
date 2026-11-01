package de.moviebox

import android.app.Application
import de.moviebox.data.SessionManager

class MovieBoxApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SessionManager.init(this)
    }
}
