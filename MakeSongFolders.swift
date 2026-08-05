import Cocoa

let application = NSApplication.shared
application.setActivationPolicy(.regular)

func showAlert(title: String, message: String, style: NSAlert.Style = .informational) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.alertStyle = style
    alert.addButton(withTitle: "OK")
    alert.runModal()
}

let commandLineTitle = CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--create" ? CommandLine.arguments[2] : nil
let isInteractive = commandLineTitle == nil

let enteredTitle: String
if let commandLineTitle {
    enteredTitle = commandLineTitle
} else {
    let prompt = NSAlert()
    prompt.messageText = "Build Song Folder"
    prompt.informativeText = "Enter the song title:"
    prompt.addButton(withTitle: "Create")
    prompt.addButton(withTitle: "Cancel")

    let titleField = NSTextField(string: "")
    titleField.placeholderString = "Song title"
    titleField.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
    prompt.accessoryView = titleField

    application.activate(ignoringOtherApps: true)
    guard prompt.runModal() == .alertFirstButtonReturn else {
        application.terminate(nil)
        exit(0)
    }
    enteredTitle = titleField.stringValue
}

let songTitle = enteredTitle
    .trimmingCharacters(in: .whitespacesAndNewlines)
    .uppercased()

guard !songTitle.isEmpty else {
    if isInteractive { showAlert(title: "Please enter a song title.", message: "") }
    application.terminate(nil)
    exit(0)
}

guard !songTitle.contains("/"), !songTitle.contains(":"), !songTitle.contains("\n"), !songTitle.contains("\r"), songTitle != ".", songTitle != ".." else {
    if isInteractive { showAlert(title: "Invalid song title.", message: "Song titles cannot contain /, :, or line breaks.", style: .warning) }
    application.terminate(nil)
    exit(0)
}

let songsFolder = Bundle.main.bundleURL.deletingLastPathComponent()
let songFolder = songsFolder.appendingPathComponent(songTitle, isDirectory: true)
let subfolders = ["ableton", "logic", "misc", "sibelius"]
let fileManager = FileManager.default

do {
    for name in subfolders {
        let folder = songFolder.appendingPathComponent("\(name)-\(songTitle)", isDirectory: true)
        try fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
    }
    if isInteractive { showAlert(title: "Song folder created", message: "Created \(songTitle) with its Ableton, Logic, Misc, and Sibelius folders.") }
} catch {
    if isInteractive { showAlert(title: "Could not create the song folder.", message: error.localizedDescription, style: .critical) }
    if !isInteractive { fputs("Could not create the song folder: \(error.localizedDescription)\n", stderr) }
}

application.terminate(nil)
