package de.moviebox.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Process-wide cache for the current user's resume rows. Loaded once per Home
 * refresh via refresh(); every card can then synchronously ask whether a media id
 * is completed / has a resume position, without each card making its own HTTP call.
 */
object ResumeCache {
    private val _rows = MutableStateFlow<Map<String, ResumeRow>>(emptyMap())
    val rows: StateFlow<Map<String, ResumeRow>> = _rows

    suspend fun refresh() {
        try {
            val resp = Api.service.meResume()
            _rows.value = resp.rows.associateBy { it.mediaId }
        } catch (_: Exception) { /* leave old data */ }
    }

    fun get(id: String): ResumeRow? = _rows.value[id]
    fun isCompleted(id: String): Boolean = _rows.value[id]?.completed == true
}
