import * as d3 from 'd3';

const ICONS: Record<string, Path2D> = {
  plane: new Path2D("M 0 -12 C 0 -15 4 -15 4 -12 L 4 -2 L 14 4 L 14 7 L 4 3 L 4 10 L 7 13 L 7 15 L 0 13 L -7 15 L -7 13 L -4 10 L -4 3 L -14 7 L -14 4 L -4 -2 L -4 -12 C -4 -15 0 -15 0 -12 Z"),
  car: new Path2D("M -5 -10 L 5 -10 C 7 -10 8 -8 8 -6 L 8 8 C 8 10 7 11 5 11 L -5 11 C -7 11 -8 10 -8 8 L -8 -6 C -8 -8 -7 -10 -5 -10 Z M -4 -5 L 4 -5 L 3 -9 L -3 -9 Z M -6 7 L 6 7 L 6 1 L -6 1 Z"),
  train: new Path2D("M -5 -12 L 5 -12 C 7 -12 7 -10 7 -10 L 7 10 C 7 12 5 12 5 12 L -5 12 C -5 12 -7 12 -7 10 L -7 -10 C -7 -10 -7 -12 -5 -12 Z M -4 -8 L 4 -8 L 4 -2 L -4 -2 Z M -4 4 L 4 4 L 4 8 L -4 8 Z M -2 14 L 2 14 L 3 16 L -3 16 Z"),
  boat: new Path2D("M 0 -12 L 6 -4 L 6 10 C 6 12 0 13 0 13 C 0 13 -6 12 -6 10 L -6 -4 Z M -4 -2 L 4 -2 L 4 4 L -4 4 Z")
};

export function drawMapFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  worldData: any,
  points: [number, number][],
  names: string[],
  modes: string[],
  segmentTravelers: Array<Array<{name: string, photo: string | null}>>,
  imageCache: Record<string, HTMLImageElement>,
  progress: number // 0 to 1
) {
  // Clear canvas
  ctx.fillStyle = '#1e293b'; // Slate background
  ctx.fillRect(0, 0, width, height);

  if (!worldData) return;

  const baseScale = Math.min(width, height) * 0.45;
  const projection = d3.geoOrthographic()
    .translate([width / 2, height / 2])
    .scale(baseScale)
    .clipAngle(90);

  let currentLon = 0;
  let currentLat = 0;
  let segmentIndex = 0;
  let segmentProgress = 0;
  let p1: [number, number] = [0, 0];
  let p2: [number, number] = [0, 0];
  let currentAngle = 0;
  
  if (points.length === 0) {
    projection.rotate([0, 0, 0]);
  } else if (points.length === 1) {
    currentLon = points[0][0];
    currentLat = points[0][1];
    projection.rotate([-currentLon, -currentLat, 0]);
    projection.scale(baseScale * 4.5); // Provide a reasonable view for single point
  } else {
    const totalSegments = Math.max(1, points.length - 1);
    const pathProgress = Math.max(0, Math.min(1, progress)) * totalSegments;
    segmentIndex = Math.max(0, Math.min(Math.floor(pathProgress), totalSegments - 1));
    segmentProgress = Math.max(0, Math.min(1, pathProgress - segmentIndex));

    p1 = points[segmentIndex];
    p2 = points[segmentIndex + 1];

    if (!p1 || !p2) {
      if (p1) { currentLon = p1[0]; currentLat = p1[1]; }
      else if (p2) { currentLon = p2[0]; currentLat = p2[1]; }
      else { currentLon = 0; currentLat = 0; }
      projection.rotate([-currentLon, -currentLat, 0]);
      projection.scale(baseScale * 4.5);
    } else {
      const interpolator = d3.geoInterpolate(p1, p2);
      
      // Add easing: pause at ends of segments
      const smoothProgress = segmentProgress * segmentProgress * (3 - 2 * segmentProgress);
      
      const currentPoint = interpolator(smoothProgress);
      if (!currentPoint) {
        currentLon = p1[0];
        currentLat = p1[1];
      } else {
        currentLon = currentPoint[0];
        currentLat = currentPoint[1];
      }
      
      // Zoom logic
      const dist = d3.geoDistance(p1, p2) || 0;
      
      // Calculate adaptive zoom based on distance
      // We want endpoint zoom to feel close
      const zoomInFactor = Math.max(5.0, Math.min(80, 2.5 / Math.max(0.001, dist)));
      // Mid-flight zoom should let us see the arc of the segment
      const zoomOutFactor = Math.max(1.5, Math.min(40, 1.2 / Math.max(0.001, dist)));
      
      const maxZoomIn = baseScale * zoomInFactor; 
      const maxZoomOut = baseScale * zoomOutFactor;
      
      const zoomParabola = Math.sin(smoothProgress * Math.PI);
      let currentScale = maxZoomIn - (maxZoomIn - maxZoomOut) * zoomParabola;
      
      let rotLon = currentLon;
      let rotLat = currentLat;
      
      const edgeThreshold = 0.1 / totalSegments; // roughly 10% of one segment's time
      if (progress < edgeThreshold && edgeThreshold > 0) {
        const startProgress = Math.max(0, progress / edgeThreshold);
        const startEase = startProgress * startProgress * (3 - 2 * startProgress);
        currentScale = baseScale + (currentScale - baseScale) * startEase;
        rotLon = currentLon * startEase;
        rotLat = currentLat * startEase;
      } else if (progress > 1 - edgeThreshold && edgeThreshold > 0) {
        const endProgress = Math.max(0, (progress - (1 - edgeThreshold)) / edgeThreshold);
        const endEase = endProgress * endProgress * (3 - 2 * endProgress);
        currentScale = currentScale + (baseScale - currentScale) * endEase;
        rotLon = currentLon * (1 - endEase);
        rotLat = currentLat * (1 - endEase);
      }
      
      projection.rotate([-rotLon, -rotLat, 0]);
      projection.scale(currentScale);

      // Calc angle for vehicle
      const angleP1 = interpolator(Math.max(0, smoothProgress - 0.001)) || p1;
      const angleP2 = interpolator(Math.min(1, smoothProgress + 0.001)) || p2;
      const centerScreen = projection(angleP1);
      const nextScreen = projection(angleP2);
      
      if (centerScreen && nextScreen && (nextScreen[0] !== centerScreen[0] || nextScreen[1] !== centerScreen[1])) {
        currentAngle = Math.atan2(nextScreen[1] - centerScreen[1], nextScreen[0] - centerScreen[0]);
      }
    }
  }

  const pathContent = d3.geoPath(projection, ctx);

  // Draw globe base (ocean)
  ctx.beginPath();
  pathContent({ type: 'Sphere' } as any);
  ctx.fillStyle = '#29598c'; // Blue Ocean
  ctx.fill();
  ctx.strokeStyle = '#1e4875'; // Ocean border
  ctx.stroke();

  // Draw countries
  ctx.beginPath();
  pathContent(worldData.world || worldData); // backwards compat
  ctx.fillStyle = '#347a4d'; // Green Land
  ctx.fill();
  ctx.strokeStyle = '#296339'; // Land border
  ctx.stroke();

  // Draw states if available
  if (worldData.states) {
    ctx.beginPath();
    pathContent(worldData.states);
    ctx.strokeStyle = '#2d6d40'; // state borders slightly different
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  // Draw active animated route
  if (points.length > 1 && progress > 0) {
    const totalSegments = points.length - 1;
    const pathProgress = progress * totalSegments;
    const currentSegmentIndex = Math.floor(pathProgress);
    const fraction = pathProgress - currentSegmentIndex;

    const linePoints: [number, number][] = [];
    
    for (let i = 0; i < currentSegmentIndex; i++) {
        const segP1 = points[i];
        const segP2 = points[i+1];
        const interp = d3.geoInterpolate(segP1, segP2);
        for(let j=0; j<=10; j++) {
            linePoints.push(interp(j/10));
        }
    }
    
    if (fraction > 0) {
        const segP1 = points[Math.min(currentSegmentIndex, points.length - 2)];
        const segP2 = points[Math.min(currentSegmentIndex + 1, points.length - 1)];
        const interp = d3.geoInterpolate(segP1, segP2);
        
        // Use the same smooth easing for the line that we use for the vehicle
        const smoothFraction = fraction * fraction * (3 - 2 * fraction);
        
        for(let j=0; j<=10; j++) {
            const t = (j/10) * smoothFraction;
            if (t <= smoothFraction) linePoints.push(interp(t));
        }
        linePoints.push(interp(smoothFraction));
    }

    if (linePoints.length > 1) {
      ctx.beginPath();
      pathContent({
        type: 'LineString',
        coordinates: linePoints
      } as any);
      
      ctx.strokeStyle = '#38bdf8'; // Cyan path
      ctx.lineWidth = Math.max(3, Math.min(width, height) / 100);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      
      ctx.stroke();
      
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = ctx.lineWidth * 0.4;
      ctx.stroke();
      
      ctx.shadowBlur = 0;
    }
  }

  // Draw markers
  points.forEach((point, index) => {
    // Only reveal destinations one by one:
    // Show previous stops, plus the next stop only if we've started travelling to it
    if (index > segmentIndex + (segmentProgress > 0 ? 1 : 0)) return;

    const visible = projection(point);
    if (!visible) return;

    // Check if the point is on the front part of the globe
    const distToCenter = d3.geoDistance([currentLon, currentLat], point);
    if (distToCenter > Math.PI / 2) return;

    // Pulse animation for active stop
    const isActive = points.length > 1 && (index === segmentIndex || index === segmentIndex + 1);
    let radius = Math.max(5, Math.min(width, height) / 70);
    
    if (isActive) {
      const pulseSpeed = 10;
      const pulse = (progress * points.length * pulseSpeed) % 1;
      ctx.beginPath();
      ctx.arc(visible[0], visible[1], radius + pulse * Math.min(width, height) / 30, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(56, 189, 248, ${1 - pulse})`; // Cyan pulse
      ctx.lineWidth = Math.max(1, Math.min(width, height) / 150);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(visible[0], visible[1], radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#7dd3fc'; // Light Cyan dot
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#0284c7'; // Darker cyan border
    ctx.lineWidth = Math.max(1, radius * 0.3);
    ctx.stroke();

    if (names[index]) {
      // Extract a shorter name if it's too long (e.g., before the comma)
      const displayName = names[index].split(',')[0].toUpperCase();
      
      const fontSize = Math.max(14, Math.min(width, height) / 30);
      ctx.font = `bold ${fontSize}px sans-serif`;
      
      // Draw background tag for text to resemble a location bubble
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      
      const paddingX = 8;
      const paddingY = 6;
      const textWidth = ctx.measureText(displayName).width;
      const tagWidth = textWidth + paddingX * 2;
      const tagHeight = fontSize + paddingY * 2;
      const tagX = visible[0] + radius + 8;
      const tagY = visible[1] - tagHeight / 2;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; // Slate 900 translucent
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 6);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      
      // Icon or national flag could go here, but for now just text
      ctx.fillStyle = '#ffffff'; // White text
      ctx.textBaseline = 'middle';
      ctx.fillText(displayName, tagX + paddingX, visible[1]);
    }
  });

  // Draw Vehicle
  if (points.length > 1 && progress <= 1) {
    const vehicleScreen = projection([currentLon, currentLat]);
    if (vehicleScreen) {
      const mode = modes[segmentIndex] || 'plane';
      const iconPath = ICONS[mode] || ICONS.plane;
      
      ctx.save();
      ctx.translate(vehicleScreen[0], vehicleScreen[1]);
      ctx.rotate(currentAngle + Math.PI / 2); // path points UP, so add 90 deg based on heading
      
      // Scale vehicle relative to resolution (make it smaller)
      const vehicleScale = Math.max(1.2, Math.min(width, height) / 250);
      ctx.scale(vehicleScale, vehicleScale);

      // Icon glow & styling
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.fill(iconPath);
      
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke(iconPath);

      ctx.restore(); // ends vehicle rotation
      
      // Draw Avatars if available
      const travelers = segmentTravelers[segmentIndex] || [];
      if (travelers.length > 0) {
          ctx.save();
          
          const r = Math.max(16, Math.min(width, height) / 35); // Absolute sizing for avatars
          const overlap = r * 0.5;
          const stepDist = r * 2 - overlap;
          
          const vehicleScale = Math.max(1.2, Math.min(width, height) / 250);
          const backDistance = 15 * vehicleScale + r + 5; 
          const backX = vehicleScreen[0] - Math.cos(currentAngle) * backDistance;
          const backY = vehicleScreen[1] - Math.sin(currentAngle) * backDistance;
          
          const totalWidth = (travelers.length - 1) * stepDist;
          const startOffset = -totalWidth / 2;
          const pAngle = currentAngle + Math.PI / 2; // Perpendicular angle
          
          // Render travelers side-by-side behind the vehicle
          for (let i = 0; i < travelers.length; i++) {
              const traveler = travelers[i];
              if (traveler.photo && imageCache[traveler.photo]) {
                  const img = imageCache[traveler.photo];
                  ctx.save();
                  
                  const offsetDist = startOffset + i * stepDist;
                  const x = backX + Math.cos(pAngle) * offsetDist;
                  const y = backY + Math.sin(pAngle) * offsetDist;
                  
                  ctx.translate(x, y);

                  // Shadow for avatar
                  ctx.shadowColor = 'rgba(0,0,0,0.5)';
                  ctx.shadowBlur = 8;
                  ctx.shadowOffsetY = 4;
                  
                  ctx.beginPath();
                  ctx.arc(0, 0, r, 0, Math.PI * 2);
                  ctx.fillStyle = '#ffffff';
                  ctx.fill();
                  
                  ctx.shadowBlur = 0;
                  ctx.shadowOffsetY = 0;
                  
                  // Image clip
                  ctx.save();
                  ctx.beginPath();
                  ctx.arc(0, 0, r, 0, Math.PI * 2);
                  ctx.clip();
                  ctx.drawImage(img, -r, -r, r * 2, r * 2);
                  ctx.restore();
                  
                  // Border
                  ctx.beginPath();
                  ctx.arc(0, 0, r, 0, Math.PI * 2);
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = Math.max(2, r * 0.15);
                  ctx.stroke();
                  
                  ctx.restore();
              }
          }
          ctx.restore();
      }
    }
  }

  // Draw HUD (Top Right)
  if (points.length > 1) {
    let totalDistanceRadians = 0;
    for(let i=0; i<segmentIndex; i++) {
        totalDistanceRadians += d3.geoDistance(points[i], points[i+1]);
    }
    if (segmentIndex < points.length - 1) {
        const p1 = points[segmentIndex];
        const p2 = points[segmentIndex + 1];
        const interp = d3.geoInterpolate(p1, p2);
        const smoothProgress = segmentProgress * segmentProgress * (3 - 2 * segmentProgress);
        const currentP = interp(smoothProgress);
        totalDistanceRadians += d3.geoDistance(p1, currentP);
    }
    const currentKm = Math.round(totalDistanceRadians * 6371);

    const hudWidth = Math.max(200, width * 0.25);
    const hudHeight = Math.max(70, height * 0.09);
    const hudX = width - hudWidth - 20;
    const hudY = 20;

    ctx.save();
    
    // Background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudWidth, hudHeight, 16);
    ctx.fill();
    
    // Inner border
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const paddingX = 20;
    const centerY1 = hudY + hudHeight * 0.35;
    const centerY2 = hudY + hudHeight * 0.65;
    
    // Divider
    ctx.beginPath();
    ctx.moveTo(hudX + paddingX, hudY + hudHeight * 0.5);
    ctx.lineTo(hudX + hudWidth - paddingX, hudY + hudHeight * 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.stroke();

    // DISTANCE Row
    ctx.beginPath();
    ctx.arc(hudX + paddingX + 4, centerY1, 4, 0, Math.PI*2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${Math.max(10, hudHeight * 0.16)}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('DISTANCE', hudX + paddingX + 16, centerY1);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(14, hudHeight * 0.25)}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`${currentKm.toLocaleString()} km`, hudX + hudWidth - paddingX, centerY1);

    // STOPS Row
    ctx.beginPath();
    ctx.arc(hudX + paddingX + 4, centerY2, 4, 0, Math.PI*2);
    ctx.fillStyle = '#10b981';
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${Math.max(10, hudHeight * 0.16)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('STOPS', hudX + paddingX + 16, centerY2);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(14, hudHeight * 0.25)}px sans-serif`;
    ctx.textAlign = 'right';
    const stopsReached = segmentIndex + (segmentProgress > 0.95 ? 1 : 0);
    ctx.fillText(`${stopsReached}`, hudX + hudWidth - paddingX, centerY2);

    ctx.restore();
  }
}
