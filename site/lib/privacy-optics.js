function grid(frame) {
  if (
    !frame ||
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    frame.width < 16 ||
    frame.height < 12 ||
    frame.width > 320 ||
    frame.height > 240 ||
    !(frame.data instanceof Uint8ClampedArray || frame.data instanceof Uint8Array) ||
    frame.data.length !== frame.width * frame.height * 4
  )
    throw new Error('invalid-frame');
  const values = [];
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 16; x++) {
      let total = 0,
        count = 0;
      for (
        let py = Math.floor((y * frame.height) / 12);
        py < Math.floor(((y + 1) * frame.height) / 12);
        py++
      )
        for (
          let px = Math.floor((x * frame.width) / 16);
          px < Math.floor(((x + 1) * frame.width) / 16);
          px++
        ) {
          const i = (py * frame.width + px) * 4;
          total += 0.2126 * frame.data[i] + 0.7152 * frame.data[i + 1] + 0.0722 * frame.data[i + 2];
          count++;
        }
      values.push(total / count);
    }
  return values;
}
export function compareFrames(a, b) {
  const first = grid(a),
    second = grid(b);
  if (a.width !== b.width || a.height !== b.height) throw new Error('frame-size-mismatch');
  let changedCells = 0,
    brightIncreases = 0,
    absolute = 0;
  const cells = second.map((value, index) => {
    const delta = Math.round(value - first[index]);
    absolute += Math.abs(value - first[index]);
    if (Math.abs(delta) >= 20) changedCells++;
    const bright = value >= 235 && delta >= 20;
    if (bright) brightIncreases++;
    return { x: index % 16, y: Math.floor(index / 16), delta, bright };
  });
  return {
    changedCells,
    brightIncreases,
    meanAbsoluteChange: Math.round((absolute / 192) * 100) / 100,
    cells,
  };
}
