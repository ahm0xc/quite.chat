const MAX_VIDEO_WIDTH = 1280;

export type TranscodeOptions = {
  maxWidth?: number;
  onProgress?: (progress: number) => void;
};

export async function isTranscodeSupported() {
  if (
    typeof window === "undefined" ||
    typeof window.VideoEncoder === "undefined" ||
    typeof window.VideoDecoder === "undefined"
  ) {
    return false;
  }

  try {
    const { canEncodeAudio, canEncodeVideo } = await import("mediabunny");
    return (
      await Promise.all([canEncodeVideo("avc"), canEncodeAudio("aac")])
    ).every(Boolean);
  } catch {
    return false;
  }
}

export async function transcodeToMp4(
  file: File,
  { maxWidth = MAX_VIDEO_WIDTH, onProgress }: TranscodeOptions = {},
) {
  if (!(await isTranscodeSupported())) {
    throw new Error("This browser cannot transcode video");
  }

  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
  } = await import("mediabunny");

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      throw new Error("This video codec cannot be decoded in this browser");
    }

    const audioTrack = await input.getPrimaryAudioTrack();
    if (audioTrack && !(await audioTrack.canDecode())) {
      throw new Error("This audio codec cannot be decoded in this browser");
    }

    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: async (track) => ({
        width: Math.min(await track.getDisplayWidth(), maxWidth),
        codec: "avc",
        quality: new Quality("medium"),
        hardwareAcceleration: "prefer-hardware",
        forceTranscode: true,
      }),
      audio: audioTrack
        ? {
            codec: "aac",
            quality: new Quality("medium"),
            forceTranscode: true,
          }
        : undefined,
    });

    if (!conversion.isValid) {
      throw new Error("This video cannot be converted to MP4");
    }

    conversion.onProgress = (progress) => onProgress?.(progress);
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer) throw new Error("Video conversion produced no output");
    return new File([buffer], `${file.name.replace(/\.[^.]+$/, "")}.mp4`, {
      type: "video/mp4",
    });
  } finally {
    input.dispose();
  }
}
