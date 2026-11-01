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
