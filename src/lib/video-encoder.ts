import * as Mp4Muxer from 'mp4-muxer';

export interface VideoEncoderOptions {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
}

export class MP4Encoder {
  private muxer: any;
  private videoEncoder: VideoEncoder;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fps: number;
  private frameCount: number = 0;

  constructor(options: VideoEncoderOptions) {
    this.fps = options.fps;
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

    this.muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: options.width,
        height: options.height,
      },
      fastStart: 'in-memory',
    });

    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('VideoEncoder Error:', e),
    });

    this.videoEncoder.configure({
      codec: 'avc1.640028', // H.264 profile
      width: options.width,
      height: options.height,
      bitrate: options.bitrate || 5_000_000, // 5 Mbps
      framerate: this.fps,
      // hardwareAcceleration: 'prefer-hardware'
    });
  }

  getCanvasContext() {
    return this.ctx;
  }

  getCanvas() {
    return this.canvas;
  }

  async addFrameFromCanvas(sourceCanvas: HTMLCanvasElement) {
    // Draw from the source canvas to our internal canvas to ensure correct sizing and context handling
    this.ctx.drawImage(sourceCanvas, 0, 0, this.canvas.width, this.canvas.height);
    
    // Create a VideoFrame from the canvas
    const timestamp = (this.frameCount / this.fps) * 1_000_000; // microseconds
    const frame = new VideoFrame(this.canvas, { timestamp });
    
    const isKeyFrame = this.frameCount % 90 === 0; // Keyframe every 3 seconds
    this.videoEncoder.encode(frame, { keyFrame: isKeyFrame });
    frame.close(); // Clean up frame immediately after passing it to encoder
    
    this.frameCount++;
  }

  async end(): Promise<ArrayBuffer> {
    await this.videoEncoder.flush();
    this.videoEncoder.close();
    this.muxer.finalize();
    return this.muxer.target.buffer;
  }
}
