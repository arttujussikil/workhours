import SwiftUI
import SwiftData

struct JobsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Job.createdAt) private var jobs: [Job]

    @State private var editing: Job?
    @State private var adding = false
    @State private var pendingDelete: Job?

    var body: some View {
        NavigationStack {
            List {
                ForEach(jobs) { job in
                    Button { editing = job } label: {
                        HStack {
                            Circle().fill(job.color).frame(width: 14, height: 14)
                            VStack(alignment: .leading) {
                                Text(job.name)
                                if job.hourlyRate > 0 {
                                    Text("\(Fmt.money(job.hourlyRate)) / h")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Text(Fmt.hours(job.totalDuration))
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                    }
                    .tint(.primary)
                    .swipeActions {
                        Button { pendingDelete = job } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        .tint(.red)
                    }
                }
            }
            .overlay {
                if jobs.isEmpty {
                    ContentUnavailableView {
                        Label("No jobs yet", systemImage: "briefcase")
                    } description: {
                        Text("Add the jobs you want to track hours for.")
                    } actions: {
                        Button("Add Job") { adding = true }
                            .buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Jobs")
            .toolbar {
                Button { adding = true } label: { Image(systemName: "plus") }
            }
            .sheet(item: $editing) { JobEditView(job: $0) }
            .sheet(isPresented: $adding) { JobEditView(job: nil) }
            .alert(
                "Delete job?",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if !$0 { pendingDelete = nil } }
                ),
                presenting: pendingDelete
            ) { job in
                Button("Delete", role: .destructive) { context.delete(job) }
                Button("Cancel", role: .cancel) {}
            } message: { job in
                Text("This also deletes all \(job.entries.count) entries for \(job.name).")
            }
        }
    }
}

struct JobEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var jobs: [Job]

    let job: Job?

    @State private var name: String
    @State private var rate: Double
    @State private var colorHex: String

    init(job: Job?) {
        self.job = job
        _name = State(initialValue: job?.name ?? "")
        _rate = State(initialValue: job?.hourlyRate ?? 0)
        _colorHex = State(initialValue: job?.colorHex ?? JobPalette.colors[0])
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Job name", text: $name)
                }
                Section("Hourly rate (optional)") {
                    TextField("0", value: $rate, format: .number)
                        .keyboardType(.decimalPad)
                }
                Section("Color") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8)) {
                        ForEach(JobPalette.colors, id: \.self) { hex in
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 30, height: 30)
                                .overlay {
                                    if hex == colorHex {
                                        Image(systemName: "checkmark")
                                            .font(.caption.bold())
                                            .foregroundStyle(.white)
                                    }
                                }
                                .onTapGesture { colorHex = hex }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle(job == nil ? "New Job" : "Edit Job")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(trimmedName.isEmpty)
                }
            }
            .onAppear {
                if job == nil {
                    colorHex = JobPalette.colors[jobs.count % JobPalette.colors.count]
                }
            }
        }
    }

    private func save() {
        if let job {
            job.name = trimmedName
            job.hourlyRate = max(0, rate)
            job.colorHex = colorHex
        } else {
            context.insert(Job(name: trimmedName, hourlyRate: max(0, rate), colorHex: colorHex))
        }
        dismiss()
    }
}
