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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import de.moviebox.data.Api
import de.moviebox.data.SourceJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var jobs by remember { mutableStateOf<List<SourceJob>>(emptyList()) }

    // live-poll while the screen is visible
    LaunchedEffect(Unit) {
        while (isActive) {
            try { jobs = Api.service.sourcesJobs().jobs } catch (_: Exception) {}
            delay(2000)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Downloads") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp)) {
            if (jobs.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                    Text("Noch keine downloads. Füg einen über + (URL) hinzu oder abonniere eine serie.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
                return@Column
            }
            val active = jobs.filter { it.status == "queued" || it.status == "running" }
            val done = jobs.filter { it.status == "done" }
            val failed = jobs.filter { it.status == "failed" }

            if (active.isNotEmpty()) {
                Section("Aktiv (${active.size})") {
                    for (j in active) { JobCardRow(j, onDelete = {
                        scope.launch { try { Api.service.sourcesJobsDelete(j.id); jobs = Api.service.sourcesJobs().jobs } catch (_: Exception) {} }
                    }); Spacer(Modifier.height(8.dp)) }
                }
                Spacer(Modifier.height(16.dp))
            }
            if (failed.isNotEmpty()) {
                Section("Fehlgeschlagen (${failed.size})") {
                    for (j in failed) { JobCardRow(j, onDelete = {
                        scope.launch { try { Api.service.sourcesJobsDelete(j.id); jobs = Api.service.sourcesJobs().jobs } catch (_: Exception) {} }
                    }); Spacer(Modifier.height(8.dp)) }
                }
                Spacer(Modifier.height(16.dp))
            }
            if (done.isNotEmpty()) {
                Section("Fertig (${done.size})") {
                    for (j in done.take(20)) { JobCardRow(j, onDelete = {
                        scope.launch { try { Api.service.sourcesJobsDelete(j.id); jobs = Api.service.sourcesJobs().jobs } catch (_: Exception) {} }
                    }); Spacer(Modifier.height(8.dp)) }
                }
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Text(
        title.uppercase(),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.SemiBold,
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.padding(bottom = 8.dp),
    )
    content()
}

@Composable
private fun JobCardRow(j: SourceJob, onDelete: () -> Unit) {
    Row(verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(end = 8.dp)) {
            Text(
                j.payload?.url.orEmpty(),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
            )
            val meta = buildList {
                add(j.status)
                if (j.payload?.mode == "preview") add("preview")
                j.progress?.pct?.let { add("%.1f %%".format(it)) }
                j.progress?.speed?.let { add(it) }
                j.progress?.eta?.let { add("ETA $it") }
            }
            val color = when (j.status) {
                "done" -> Color(0xFF4ADE80)
                "failed" -> MaterialTheme.colorScheme.error
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            }
            Text(meta.joinToString(" · "), color = color, style = MaterialTheme.typography.labelSmall)
            j.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
            if (j.progress?.pct != null && j.status == "running") {
                Spacer(Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = { (j.progress.pct / 100.0).toFloat().coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        IconButton(onClick = onDelete, modifier = Modifier.height(32.dp)) {
            Icon(Icons.Filled.Close, contentDescription = "Entfernen", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
