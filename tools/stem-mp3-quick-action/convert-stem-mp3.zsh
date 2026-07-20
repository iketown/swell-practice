#!/bin/zsh

# Convert Finder-selected WAV/AIFF part stems into web-delivery MP3s.
#
# House standard:
# - every valid source becomes mono at 128 kbps CBR
# - stereo sources are downmixed to mono
# - preserve a shared 44.1 kHz or 48 kHz source sample rate
# - never overwrite an existing MP3 or modify the source audio file

setopt NO_NOMATCH

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

readonly ACTION_TITLE="Convert to Stem MP3"
readonly MAX_ERROR_DETAILS=8

typeset -a source_files
typeset -a sample_rates
typeset -a source_channel_counts
typeset -a output_files
typeset -a validation_errors
typeset -A seen_outputs

function show_notification() {
  local message="$1"

  if [[ "${SWELL_STEM_MP3_NO_NOTIFY:-0}" == "1" ]]; then
    return
  fi

  /usr/bin/osascript - "$ACTION_TITLE" "$message" >/dev/null 2>&1 <<'APPLESCRIPT' || true
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
APPLESCRIPT
}

function show_error() {
  local message="$1"

  print -r -- "${ACTION_TITLE}: ${message}" >&2

  if [[ "${SWELL_STEM_MP3_NO_NOTIFY:-0}" == "1" ]]; then
    return
  fi

  /usr/bin/osascript - "$ACTION_TITLE" "$message" >/dev/null 2>&1 <<'APPLESCRIPT' || true
on run argv
  display alert (item 1 of argv) message (item 2 of argv) as critical
end run
APPLESCRIPT
}

function stop_with_error() {
  show_error "$1"
  exit 1
}

function joined_validation_errors() {
  local detail_count=${#validation_errors[@]}
  local visible_count=$detail_count
  local message=""
  local index

  if (( visible_count > MAX_ERROR_DETAILS )); then
    visible_count=$MAX_ERROR_DETAILS
  fi

  for (( index = 1; index <= visible_count; index++ )); do
    if [[ -n "$message" ]]; then
      message+=$'\n'
    fi
    message+="• ${validation_errors[$index]}"
  done

  if (( detail_count > visible_count )); then
    message+=$'\n'
    message+="• …and $(( detail_count - visible_count )) more"
  fi

  print -r -- "$message"
}

ffmpeg_path="$(command -v ffmpeg 2>/dev/null)"
ffprobe_path="$(command -v ffprobe 2>/dev/null)"

if [[ -z "$ffmpeg_path" || -z "$ffprobe_path" ]]; then
  stop_with_error "FFmpeg is required but was not found. Install FFmpeg with Homebrew, then try again."
fi

if (( $# == 0 )); then
  stop_with_error "No files were selected."
fi

for selected_item in "$@"; do
  if [[ ! -f "$selected_item" ]]; then
    validation_errors+=("$(basename "$selected_item"): not a regular file")
    continue
  fi

  extension="${selected_item##*.}"
  extension="${(L)extension}"

  case "$extension" in
    wav|wave|aif|aiff|aifc)
      source_files+=("$selected_item")
      ;;
    *)
      validation_errors+=("$(basename "$selected_item"): not a WAV or AIFF file")
      ;;
  esac
done

if (( ${#source_files[@]} == 0 )); then
  if (( ${#validation_errors[@]} > 0 )); then
    stop_with_error "$(joined_validation_errors)"
  fi

  stop_with_error "No WAV or AIFF files were selected."
fi

batch_sample_rate=""

for input_file in "${source_files[@]}"; do
  probe_result="$(
    "$ffprobe_path" \
      -v error \
      -select_streams a:0 \
      -show_entries stream=sample_rate,channels \
      -of csv=p=0 \
      "$input_file" 2>/dev/null
  )"
  probe_status=$?

  if (( probe_status != 0 )) || [[ -z "$probe_result" || "$probe_result" != *,* ]]; then
    validation_errors+=("$(basename "$input_file"): no readable audio stream")
    sample_rates+=("")
    source_channel_counts+=("")
    output_files+=("")
    continue
  fi

  sample_rate="${probe_result%%,*}"
  source_channels="${probe_result##*,}"

  if [[ "$sample_rate" == *[!0-9]* || "$source_channels" == *[!0-9]* ]]; then
    validation_errors+=("$(basename "$input_file"): unreadable channel or sample-rate data")
  elif [[ "$sample_rate" != "44100" && "$sample_rate" != "48000" ]]; then
    validation_errors+=("$(basename "$input_file"): unsupported ${sample_rate} Hz sample rate")
  elif [[ "$source_channels" != "1" && "$source_channels" != "2" ]]; then
    validation_errors+=("$(basename "$input_file"): ${source_channels} channels; only mono or stereo is allowed")
  elif [[ -z "$batch_sample_rate" ]]; then
    batch_sample_rate="$sample_rate"
  elif [[ "$sample_rate" != "$batch_sample_rate" ]]; then
    validation_errors+=("$(basename "$input_file"): ${sample_rate} Hz does not match the ${batch_sample_rate} Hz batch")
  fi

  output_file="${input_file%.*}.mp3"
  output_key="${(L)output_file}"

  if [[ -n "${seen_outputs[$output_key]:-}" ]]; then
    validation_errors+=("$(basename "$input_file"): duplicates the output for $(basename "${seen_outputs[$output_key]}")")
  else
    seen_outputs[$output_key]="$input_file"
  fi

  if [[ ! -w "${input_file:h}" ]]; then
    validation_errors+=("$(basename "$input_file"): its folder is not writable")
  fi

  sample_rates+=("$sample_rate")
  source_channel_counts+=("$source_channels")
  output_files+=("$output_file")
done

if (( ${#validation_errors[@]} > 0 )); then
  stop_with_error "$(joined_validation_errors)"
fi

converted_count=0
skipped_count=0
failed_count=0
typeset -a conversion_errors

for (( file_index = 1; file_index <= ${#source_files[@]}; file_index++ )); do
  input_file="${source_files[$file_index]}"
  sample_rate="${sample_rates[$file_index]}"
  source_channels="${source_channel_counts[$file_index]}"
  output_file="${output_files[$file_index]}"

  if [[ -e "$output_file" ]]; then
    print -r -- "Skipped existing output: $output_file"
    (( skipped_count++ ))
    continue
  fi

  bitrate="128k"

  temporary_file="$(mktemp "${output_file:h}/.swell-stem-mp3.XXXXXX")"
  if [[ -z "$temporary_file" ]]; then
    conversion_errors+=("$(basename "$input_file"): could not create a temporary output")
    (( failed_count++ ))
    continue
  fi

  "$ffmpeg_path" \
    -hide_banner \
    -loglevel error \
    -nostdin \
    -y \
    -i "$input_file" \
    -map 0:a:0 \
    -map_metadata -1 \
    -vn \
    -c:a libmp3lame \
    -b:a "$bitrate" \
    -ar "$sample_rate" \
    -ac 1 \
    -f mp3 \
    "$temporary_file"
  ffmpeg_status=$?

  if (( ffmpeg_status != 0 )); then
    /bin/rm -f "$temporary_file"
    conversion_errors+=("$(basename "$input_file"): FFmpeg conversion failed")
    (( failed_count++ ))
    continue
  fi

  if [[ -e "$output_file" ]]; then
    /bin/rm -f "$temporary_file"
    print -r -- "Skipped output created by another process: $output_file"
    (( skipped_count++ ))
    continue
  fi

  if ! /bin/mv "$temporary_file" "$output_file"; then
    /bin/rm -f "$temporary_file"
    conversion_errors+=("$(basename "$input_file"): could not save the MP3")
    (( failed_count++ ))
    continue
  fi

  if [[ "$source_channels" == "2" ]]; then
    channel_description="mono from stereo source"
  else
    channel_description="mono"
  fi

  print -r -- "Created: $output_file (${channel_description}, ${bitrate}, ${sample_rate} Hz)"
  (( converted_count++ ))
done

if (( failed_count > 0 )); then
  validation_errors=("${conversion_errors[@]}")
  failure_message="$(joined_validation_errors)"
  failure_message+=$'\n\n'
  failure_message+="${converted_count} converted, ${skipped_count} skipped, ${failed_count} failed."
  stop_with_error "$failure_message"
fi

summary="${converted_count} converted to mono"

if (( skipped_count > 0 )); then
  summary+=", ${skipped_count} skipped because an MP3 already exists"
fi

summary+=". Source files were kept."
print -r -- "$summary"
show_notification "$summary"
