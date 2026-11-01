package de.moviebox.data

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(val username: String, val password: String, val device: String = "Android")

@Serializable
data class LoginResponse(val token: String, val user: User)

@Serializable
data class User(val id: String, val username: String, val displayName: String, val role: String, val hasPassword: Boolean = false)

@Serializable
data class MeResponse(val user: User)

@Serializable
data class HealthResponse(val ok: Boolean, val version: String? = null)

/** Compact movie/episode shape, used in grids and lists. */
@Serializable
data class MediaCard(
    val id: String,
    val kind: String,                // "movie" | "episode"
    val title: String,
    val year: Int? = null,
    val poster: String? = null,
    val still: String? = null,
    val runtimeSec: Double? = null,
    val addedAt: String? = null,
    val showId: String? = null,
    val showTitle: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val positionSec: Double? = null,
    val liked: Boolean = false,
    val preview: Boolean = false,
)

@Serializable
data class HomeResponse(
    val `continue`: List<MediaCard> = emptyList(),
    val recentMovies: List<MediaCard> = emptyList(),
    val recentEpisodes: List<MediaCard> = emptyList(),
)

@Serializable
data class MoviesResponse(val movies: List<MediaCard>)

@Serializable
data class ShowSummary(
    val id: String,
    val title: String,
    val year: Int? = null,
    val poster: String? = null,
    val overview: String? = null,
)

@Serializable
data class ShowsResponse(val shows: List<ShowSummary>)

@Serializable
data class ShowDetail(
    val id: String,
    val title: String,
    val year: Int? = null,
    val poster: String? = null,
    val backdrop: String? = null,
    val overview: String? = null,
    val genres: List<String> = emptyList(),
)

@Serializable
data class ShowDetailResponse(
    val show: ShowDetail,
    val seasons: Map<String, List<MediaCard>>,
)

@Serializable
data class MovieDetail(
    val id: String,
    val title: String,
    val year: Int? = null,
    val poster: String? = null,
    val backdrop: String? = null,
    val overview: String? = null,
    val genres: List<String> = emptyList(),
    val runtimeSec: Double? = null,
    val liked: Boolean = false,
    val preview: Boolean = false,
)

@Serializable
data class MovieDetailResponse(val movie: MovieDetail)

@Serializable
data class ResumePosition(val positionSec: Double = 0.0, val completed: Boolean = false)

@Serializable
data class ResumeUpdate(val positionSec: Double, val durationSec: Double)

@Serializable
data class SearchResponse(
    val movies: List<MediaCard> = emptyList(),
    val shows: List<ShowSummary> = emptyList(),
    val episodes: List<MediaCard> = emptyList(),
)

@Serializable
data class DiscoverItem(
    val tmdbId: Long,
    val kind: String,   // "movie" | "tv"
    val title: String,
    val year: String? = null,
    val overview: String = "",
    val poster: String? = null,
    val backdrop: String? = null,
    val rating: Double? = null,
)

@Serializable
data class DiscoverResponse(val results: List<DiscoverItem> = emptyList())

@Serializable
data class SourceInfo(
    val backend: String,
    val kind: String,
    val title: String,
    val durationSec: Double? = null,
    val sizeBytes: Long? = null,
    val sourceUrl: String? = null,
    val extractor: String? = null,
    val thumbnail: String? = null,
    val year: Int? = null,
    val filename: String? = null,
    val uploader: String? = null,
)

@Serializable
data class ResolveResponse(val info: SourceInfo)

@Serializable
data class SourceAddRequest(val url: String, val mode: String = "keep")

@Serializable
data class AddJobResponse(val ok: Boolean = true, val jobId: String? = null)

@Serializable
data class JobPayload(val url: String? = null, val mode: String? = null)

@Serializable
data class JobProgress(val pct: Double? = null, val speed: String? = null, val eta: String? = null, val size: String? = null)

@Serializable
data class SourceJob(
    val id: String,
    val status: String,
    val payload: JobPayload? = null,
    val progress: JobProgress? = null,
    val error: String? = null,
)

@Serializable
data class SourceJobsResponse(val jobs: List<SourceJob> = emptyList())

@Serializable
data class RandomResponse(val item: MediaCard)

@Serializable
data class DiscoverSource(
    val backend: String,            // "archive" | "torrentio" | "direct" | "ytdlp"
    val title: String,
    val url: String? = null,        // either url or magnet is set
    val magnet: String? = null,
    val quality: String? = null,    // e.g. "1080p"
    val sizeBytes: Long? = null,
    val seeders: Int? = null,
    val language: String? = null,
    val provider: String? = null,
)

@Serializable
data class DiscoverSourcesResponse(
    val sources: List<DiscoverSource> = emptyList(),
    val capabilities: Map<String, Boolean> = emptyMap(),
)
