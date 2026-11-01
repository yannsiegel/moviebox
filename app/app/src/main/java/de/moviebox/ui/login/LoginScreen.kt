package de.moviebox.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import de.moviebox.data.Api
import de.moviebox.data.LoginRequest
import de.moviebox.data.SessionManager
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(onLoggedIn: () -> Unit) {
    val scope = rememberCoroutineScope()
    var baseUrl by remember { mutableStateOf(TextFieldValue(SessionManager.state.value.baseUrl)) }
    var username by remember { mutableStateOf(TextFieldValue(SessionManager.state.value.username)) }
    var password by remember { mutableStateOf(TextFieldValue("")) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    // Prefill a sensible default so the first time the field isn't just blank.
    LaunchedEffect(Unit) {
        if (baseUrl.text.isEmpty()) baseUrl = TextFieldValue("https://")
    }

    Scaffold { pad ->
        Column(
            modifier = Modifier.fillMaxSize().padding(pad).padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("MovieBox", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Anmelden", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = baseUrl, onValueChange = { baseUrl = it },
                label = { Text("Server-Adresse") },
                placeholder = { Text("https://movies.deine-domain.de") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = username, onValueChange = { username = it },
                label = { Text("Benutzername") }, singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password, onValueChange = { password = it },
                label = { Text("Passwort") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )

            if (error.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(24.dp))
            Button(
                enabled = !busy && baseUrl.text.isNotBlank() && username.text.isNotBlank() && password.text.isNotEmpty(),
                onClick = {
                    busy = true; error = ""
                    scope.launch {
                        try {
                            // Configure Api with just the URL first so we can call /login without a token.
                            val url = baseUrl.text.trimEnd('/')
                            Api.rebuild(url, "")
                            val resp = Api.service.login(LoginRequest(username.text.trim(), password.text, "MovieBox Android"))
                            SessionManager.save(url, resp.token, resp.user.username)
                            onLoggedIn()
                        } catch (ex: Exception) {
                            error = ex.message ?: "Login fehlgeschlagen"
                        } finally {
                            busy = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (busy) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.height(16.dp))
                else Text("Anmelden")
            }
        }
    }
}
