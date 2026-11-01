package de.moviebox.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import de.moviebox.data.Api
import de.moviebox.data.SourceAddRequest
import de.moviebox.data.SourceInfo
import de.moviebox.data.SourceJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddUrlScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf("") }
    var info by remember { mutableStateOf<SourceInfo?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var probing by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf("keep") }
    var jobs by remember { mutableStateOf<List<SourceJob>>(emptyList()) }
    var toast by remember { mutableStateOf<String?>(null) }

    // Poll jobs while this screen is open.
    LaunchedEffect(Unit) {
        while (isActive) {
            try { jobs = Api.service.sourcesJobs().jobs } catch (_: Exception) {}
            delay(2000)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Video per URL hinzufügen") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp),
        ) {
            Text(
                "YouTube, Vimeo, Archive.org, direkte .mp4/.mkv-Links – alles, was yt-dlp kennt.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = url, onValueChange = { url = it; info = null; error = null },
                placeholder = { Text("https://…") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )

            if (info != null) {
                Spacer(Modifier.height(10.dp))
                val bits = buildList {
                    add(info!!.title.ifEmpty { "(ohne Titel)" })
                    info!!.durationSec?.let { add("${(it / 60).toInt()} min") }
                    info!!.sizeBytes?.let { add("%.2f GB".format(it / 1_073_741_824.0)) }
                    info!!.extractor?.let { add(it) }
                }
                Text(bits.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
            }
            if (error != null) {
                Spacer(Modifier.height(10.dp))
                Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(16.dp))
            Text("Modus", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
            Column(Modifier.padding(top = 4.dp)) {
                ModeRow(selected = mode == "keep", label = "Behalten", onClick = { mode = "keep" })
                ModeRow(selected = mode == "preview", label = "Nur einmal schauen (nach 48 h weg)", onClick = { mode = "preview" })
            }

            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    enabled = url.isNotBlank() && !probing,
                    onClick = {
                        probing = true; error = null; info = null
                        scope.launch {
                            try { info = Api.service.sourcesResolve(mapOf("url" to url.trim())).info }
                            catch (ex: Exception) { error = ex.message }
                            finally { probing = false }
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    if (probing) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.height(16.dp))
                    else Text("Prüfen")
                }
                Button(
                    enabled = url.isNotBlank(),
                    onClick = {
                        toast = null
                        scope.launch {
                            try {
                                Api.service.sourcesAdd(SourceAddRequest(url.trim(), mode))
                                toast = if (mode == "preview") "Preview-Download läuft …" else "Download läuft …"
                                url = ""; info = null
                            } catch (ex: Exception) { toast = ex.message }
                        }
                    },
                    modifier = Modifier.weight(1f),
                ) { Text("Hinzufügen") }
            }

            toast?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            }

            // ---- jobs
            Spacer(Modifier.height(28.dp))
            Text(
                "LAUFENDE & LETZTE DOWNLOADS",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            if (jobs.isEmpty()) {
                Text("Noch nichts.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            } else {
                for (j in jobs) {
                    JobCard(j)
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
    }
}

@Composable
private fun ModeRow(selected: Boolean, label: String, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().selectable(selected = selected, onClick = onClick).padding(vertical = 2.dp),
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Spacer(Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun JobCard(job: SourceJob) {
    Column(
        Modifier.fillMaxWidth()
            .padding(vertical = 2.dp),
    ) {
        Text(job.payload?.url.orEmpty(), maxLines = 2, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
        val sub = buildList {
            add(job.status)
            if (job.payload?.mode == "preview") add("preview")
            job.progress?.pct?.let { add("%.1f %%".format(it)) }
            job.progress?.speed?.let { add(it) }
            job.progress?.eta?.let { add("ETA $it") }
            job.error?.let { add(it) }
        }
        Text(sub.joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        if (job.progress?.pct != null && job.status != "done") {
            Spacer(Modifier.height(2.dp))
            LinearProgressIndicator(
                progress = { (job.progress.pct / 100.0).toFloat().coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

