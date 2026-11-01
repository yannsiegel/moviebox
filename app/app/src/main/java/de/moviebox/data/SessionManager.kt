package de.moviebox.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Holds the server URL, the login token and the current user. All of this is persisted in
 * DataStore so a cold start restores the session. The UI reads session state via the flow.
 */
object SessionManager {
    private val Context.store by preferencesDataStore(name = "moviebox")
    private val BASE_URL = stringPreferencesKey("base_url")
    private val TOKEN = stringPreferencesKey("token")
    private val USERNAME = stringPreferencesKey("username")

    private lateinit var appContext: Context
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    data class State(val baseUrl: String = "", val token: String = "", val username: String = "")

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    fun init(context: Context) {
        appContext = context.applicationContext
        scope.launch {
            val prefs = appContext.store.data.first()
            _state.value = State(
                baseUrl = prefs[BASE_URL].orEmpty(),
                token = prefs[TOKEN].orEmpty(),
                username = prefs[USERNAME].orEmpty(),
            )
            Api.rebuild(_state.value.baseUrl, _state.value.token)
        }
    }

    fun save(baseUrl: String, token: String, username: String) {
        _state.value = State(baseUrl.trimEnd('/'), token, username)
        Api.rebuild(baseUrl.trimEnd('/'), token)
        scope.launch {
            appContext.store.edit {
                it[BASE_URL] = baseUrl.trimEnd('/')
                it[TOKEN] = token
                it[USERNAME] = username
            }
        }
    }

    fun clear() {
        _state.value = State()
        Api.rebuild("", "")
        scope.launch {
            appContext.store.edit { it.clear() }
        }
    }

    fun isLoggedIn(): Boolean = _state.value.token.isNotEmpty() && _state.value.baseUrl.isNotEmpty()
}
