import Foundation
import SwiftUI

enum Fmt {
    /// "7h 30m", "45m", "8h"
    static func hours(_ seconds: TimeInterval) -> String {
        let totalMinutes = Int(seconds / 60)
        let h = totalMinutes / 60
        let m = totalMinutes % 60
        if h == 0 { return "\(m)m" }
        if m == 0 { return "\(h)h" }
        return "\(h)h \(m)m"
    }

    /// "1:23:45"
    static func clock(_ seconds: TimeInterval) -> String {
        let s = Int(seconds)
        return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
    }

    /// "7.50"
    static func decimalHours(_ seconds: TimeInterval) -> String {
        String(format: "%.2f", seconds / 3600)
    }

    static var currencyCode: String {
        Locale.current.currency?.identifier ?? "EUR"
    }

    static func money(_ value: Double) -> String {
        value.formatted(.currency(code: currencyCode))
    }

    static func time(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}

enum JobPalette {
    static let colors = [
        "#007AFF", "#34C759", "#FF9500", "#FF3B30",
        "#AF52DE", "#5AC8FA", "#FF2D55", "#A2845E",
    ]
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
