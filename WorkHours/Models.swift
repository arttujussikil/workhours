import Foundation
import SwiftData
import SwiftUI

@Model
final class Job {
    var name: String = ""
    var hourlyRate: Double = 0
    var colorHex: String = "#007AFF"
    var createdAt: Date = Date.now

    @Relationship(deleteRule: .cascade, inverse: \WorkEntry.job)
    var entries: [WorkEntry] = []

    init(name: String, hourlyRate: Double = 0, colorHex: String = JobPalette.colors[0]) {
        self.name = name
        self.hourlyRate = hourlyRate
        self.colorHex = colorHex
        self.createdAt = .now
    }

    var color: Color { Color(hex: colorHex) }

    var totalDuration: TimeInterval {
        entries.reduce(0) { $0 + $1.duration() }
    }
}

@Model
final class WorkEntry {
    var start: Date = Date.now
    /// `nil` while the timer is still running.
    var end: Date?
    var breakMinutes: Int = 0
    var note: String = ""
    var job: Job?

    init(job: Job?, start: Date = .now, end: Date? = nil, breakMinutes: Int = 0, note: String = "") {
        self.job = job
        self.start = start
        self.end = end
        self.breakMinutes = breakMinutes
        self.note = note
    }

    var isRunning: Bool { end == nil }

    /// Worked time in seconds, with breaks subtracted.
    func duration(at now: Date = .now) -> TimeInterval {
        let raw = (end ?? now).timeIntervalSince(start) - Double(breakMinutes) * 60
        return max(0, raw)
    }

    func earnings(at now: Date = .now) -> Double {
        duration(at: now) / 3600 * (job?.hourlyRate ?? 0)
    }
}
