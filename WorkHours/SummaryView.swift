import SwiftUI
import SwiftData
import Charts
import UniformTypeIdentifiers

enum SummaryPeriod: String, CaseIterable, Identifiable {
    case week = "Week"
    case month = "Month"
    case year = "Year"

    var id: Self { self }

    var component: Calendar.Component {
        switch self {
        case .week: .weekOfYear
        case .month: .month
        case .year: .year
        }
    }
}

struct SummaryView: View {
    @Query(sort: \WorkEntry.start) private var entries: [WorkEntry]

    @State private var period: SummaryPeriod = .week
    @State private var anchor: Date = .now

    private let calendar = Calendar.current

    private var interval: DateInterval {
        calendar.dateInterval(of: period.component, for: anchor)
            ?? DateInterval(start: anchor, duration: 0)
    }

    private var periodEntries: [WorkEntry] {
        entries.filter { $0.start >= interval.start && $0.start < interval.end }
    }

    private struct JobTotal: Identifiable {
        let id: PersistentIdentifier?
        let name: String
        let color: Color
        let seconds: TimeInterval
        let earnings: Double
    }

    private var jobTotals: [JobTotal] {
        let groups = Dictionary(grouping: periodEntries) { $0.job?.persistentModelID }
        return groups.map { key, list in
            let job = list.first?.job
            return JobTotal(
                id: key,
                name: job?.name ?? "No job",
                color: job?.color ?? .gray,
                seconds: list.reduce(0) { $0 + $1.duration() },
                earnings: list.reduce(0) { $0 + $1.earnings() }
            )
        }
        .sorted { $0.seconds > $1.seconds }
    }

    private struct ChartPoint: Identifiable {
        let id = UUID()
        let bucket: Date
        let job: String
        let hours: Double
    }

    private var bucketUnit: Calendar.Component {
        period == .year ? .month : .day
    }

    private var chartPoints: [ChartPoint] {
        periodEntries.map { entry in
            ChartPoint(
                bucket: calendar.dateInterval(of: bucketUnit, for: entry.start)?.start ?? entry.start,
                job: entry.job?.name ?? "No job",
                hours: entry.duration() / 3600
            )
        }
    }

    private var title: String {
        switch period {
        case .week:
            let last = interval.end.addingTimeInterval(-1)
            return "\(interval.start.formatted(.dateTime.day().month())) – \(last.formatted(.dateTime.day().month().year()))"
        case .month:
            return anchor.formatted(.dateTime.month(.wide).year())
        case .year:
            return anchor.formatted(.dateTime.year())
        }
    }

    var body: some View {
        let totals = jobTotals
        let totalSeconds = totals.reduce(0) { $0 + $1.seconds }
        let totalEarnings = totals.reduce(0) { $0 + $1.earnings }

        NavigationStack {
            List {
                Section {
                    Picker("Period", selection: $period) {
                        ForEach(SummaryPeriod.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())

                    HStack {
                        Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                        Spacer()
                        Text(title).font(.headline)
                        Spacer()
                        Button { shift(1) } label: { Image(systemName: "chevron.right") }
                            .disabled(interval.end > .now)
                    }
                    .buttonStyle(.borderless)
                }

                Section {
                    HStack {
                        Stat(label: "Hours", value: Fmt.hours(totalSeconds))
                        if totalEarnings > 0 {
                            Divider()
                            Stat(label: "Earnings", value: Fmt.money(totalEarnings))
                        }
                    }

                    if !chartPoints.isEmpty {
                        Chart(chartPoints) { point in
                            BarMark(
                                x: .value("Date", point.bucket, unit: bucketUnit),
                                y: .value("Hours", point.hours)
                            )
                            .foregroundStyle(by: .value("Job", point.job))
                        }
                        .chartForegroundStyleScale(
                            domain: totals.map(\.name),
                            range: totals.map(\.color)
                        )
                        .chartXScale(domain: interval.start...interval.end)
                        .chartLegend(.hidden)
                        .frame(height: 180)
                        .padding(.vertical, 8)
                    }
                }

                Section("By job") {
                    if totals.isEmpty {
                        Text("No hours in this period.").foregroundStyle(.secondary)
                    }
                    ForEach(totals) { item in
                        HStack {
                            Circle().fill(item.color).frame(width: 12, height: 12)
                            Text(item.name)
                            Spacer()
                            VStack(alignment: .trailing) {
                                Text(Fmt.hours(item.seconds)).monospacedDigit()
                                if item.earnings > 0 {
                                    Text(Fmt.money(item.earnings))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Summary")
            .toolbar {
                ShareLink(
                    item: CSVExport(csv: CSVExport.make(from: periodEntries)),
                    preview: SharePreview("Work hours (\(title)).csv")
                ) {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(periodEntries.isEmpty)
            }
        }
    }

    private func shift(_ amount: Int) {
        anchor = calendar.date(byAdding: period.component, value: amount, to: anchor) ?? anchor
    }
}

private struct Stat: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value).font(.title2.weight(.semibold)).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
}

struct CSVExport: Transferable {
    let csv: String

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .commaSeparatedText) { export in
            Data(export.csv.utf8)
        }
        .suggestedFileName("work-hours.csv")
    }

    static func make(from entries: [WorkEntry]) -> String {
        let day = DateFormatter()
        day.dateFormat = "yyyy-MM-dd"
        let time = DateFormatter()
        time.dateFormat = "HH:mm"

        func escape(_ s: String) -> String {
            "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }

        var lines = ["Date,Job,Start,End,Break (min),Hours,Earnings,Note"]
        for e in entries.sorted(by: { $0.start < $1.start }) {
            lines.append([
                day.string(from: e.start),
                escape(e.job?.name ?? ""),
                time.string(from: e.start),
                e.end.map { time.string(from: $0) } ?? "",
                String(e.breakMinutes),
                Fmt.decimalHours(e.duration()),
                String(format: "%.2f", e.earnings()),
                escape(e.note),
            ].joined(separator: ","))
        }
        return lines.joined(separator: "\n")
    }
}
