/**
 * Simple two-channel oscilloscope drawing utility.
 */
import { formatEngineering } from './util.js';

class RingBuffer {
  constructor(size) {
    this.size = size;
    this.data = new Array(size).fill([0, 0]);
    this.index = 0;
    this.count = 0;
  }
  push(point) {
    this.data[this.index] = point;
    this.index = (this.index + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }
  values() {
    if (this.count < this.size) return this.data.slice(0, this.count);
    return [...this.data.slice(this.index), ...this.data.slice(0, this.index)];
  }
}

export class Scope {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buffers = { ch1: new RingBuffer(1024), ch2: new RingBuffer(1024) };
    this.vDiv = 1;
    this.tDiv = 1e-3;
    this.ch1Node = null;
    this.ch2Node = null;
  }

  setNodes(n1, n2) {
    this.ch1Node = n1;
    this.ch2Node = n2;
  }

  setScales({ vDiv, tDiv }) {
    if (vDiv) this.vDiv = vDiv;
    if (tDiv) this.tDiv = tDiv;
  }

  sample(time, v1, v2) {
    this.buffers.ch1.push([time, v1]);
    this.buffers.ch2.push([time, v2]);
  }

  draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.fillStyle = '#050912';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const x = (i / 10) * width;
      const y = (i / 10) * height;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const drawWave = (data, color) => {
      if (data.length < 2) return;
      const span = this.tDiv * 10;
      const tMax = data[data.length - 1][0];
      const tMin = tMax - span;
      ctx.strokeStyle = color;
      ctx.beginPath();
      data.forEach(([t, v], idx) => {
        const x = ((t - tMin) / span) * width;
        const y = height / 2 - (v / (this.vDiv * 5)) * height / 2;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawWave(this.buffers.ch1.values(), '#fbbf24');
    drawWave(this.buffers.ch2.values(), '#22d3ee');

    ctx.fillStyle = '#e5e7eb';
    ctx.font = '12px Inter';
    ctx.fillText(`CH1 ${formatEngineering(this.vDiv)} V/div`, 10, 16);
    ctx.fillText(`Time ${formatEngineering(this.tDiv)} s/div`, 10, 32);
  }
}
