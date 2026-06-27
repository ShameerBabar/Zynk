import React, { useEffect, useRef } from 'react';
import './ThemeRenderer.css';

const THEME_TYPES = {
  rain: 'particles',
  snow: 'particles',
  space: 'particles',
  sakura: 'particles',
  fireflies: 'particles',
  ocean: 'css',
  aurora: 'css',
};

export default function ThemeRenderer({ theme, intensity = 0.5, enabled = true }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const particlesRef = useRef([]);

  useEffect(() => {
    if (!enabled || !theme || THEME_TYPES[theme] !== 'particles') {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initParticles();
    };
    window.addEventListener('resize', handleResize);

    const initParticles = () => {
      let count = 0;
      particlesRef.current = [];
      
      switch (theme) {
        case 'rain': count = 100 + (intensity * 200); break;
        case 'snow': count = 50 + (intensity * 150); break;
        case 'space': count = 100 + (intensity * 300); break;
        case 'sakura': count = 30 + (intensity * 80); break;
        case 'fireflies': count = 20 + (intensity * 50); break;
        default: count = 0;
      }

      for (let i = 0; i < count; i++) {
        particlesRef.current.push(createParticle(theme, width, height));
      }
    };

    const createParticle = (type, w, h) => {
      const p = {
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 2 + 1,
        speedX: 0,
        speedY: 0,
        opacity: Math.random() * 0.5 + 0.3,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.1,
      };

      switch (type) {
        case 'rain':
          // Scale speed based on screen height for mobile consistency, and factor in intensity
          const baseSpeed = (h * 0.008) + 4;
          p.speedY = Math.random() * (baseSpeed * 0.5) + baseSpeed + (intensity * 5);
          p.speedX = Math.random() * 2 - 1;
          p.size = Math.random() * 1.5 + 1;
          p.length = Math.random() * 20 + 10;
          break;
        case 'snow':
          p.speedY = Math.random() * 2 + 1;
          p.speedX = (Math.random() - 0.5) * 1;
          p.size = Math.random() * 3 + 1;
          p.amplitude = Math.random() * 2;
          p.frequency = Math.random() * 0.02;
          break;
        case 'space':
          p.speedY = 0;
          p.speedX = 0;
          p.size = Math.random() * 1.5 + 0.5;
          p.z = Math.random() * w; // For 3D starfield effect
          break;
        case 'sakura':
          p.speedY = Math.random() * 1.5 + 0.5;
          p.speedX = Math.random() * 2 + 0.5;
          p.size = Math.random() * 6 + 4;
          p.color = `rgba(255, 183, 197, ${p.opacity})`;
          p.amplitude = Math.random() * 3;
          p.frequency = Math.random() * 0.01;
          break;
        case 'fireflies':
          p.y = h * 0.5 + Math.random() * (h * 0.5); // Bottom half
          p.speedY = (Math.random() - 0.5) * 0.5;
          p.speedX = (Math.random() - 0.5) * 0.5;
          p.size = Math.random() * 2 + 1.5;
          p.pulseSpeed = Math.random() * 0.05 + 0.01;
          break;
      }
      return p;
    };

    initParticles();

    let lastTime = 0;
    const render = (time) => {
      try {
        ctx.clearRect(0, 0, width, height);

        particlesRef.current.forEach((p) => {
        switch (theme) {
          case 'rain':
            p.x += p.speedX;
            p.y += p.speedY;
            if (p.y > height) { p.y = -p.length; p.x = Math.random() * width; }
            ctx.beginPath();
            ctx.strokeStyle = `rgba(100, 150, 255, ${p.opacity * intensity})`;
            ctx.lineWidth = p.size;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.speedX * 2, p.y - p.length);
            ctx.stroke();
            break;

          case 'snow':
            p.angle += p.frequency;
            p.x += p.speedX + Math.sin(p.angle) * p.amplitude;
            p.y += p.speedY;
            if (p.y > height) { p.y = -10; p.x = Math.random() * width; }
            if (p.x > width) p.x = 0;
            if (p.x < 0) p.x = width;
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * intensity})`;
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            break;

          case 'space':
            p.z -= 0.5 + (intensity * 2);
            if (p.z <= 0) { p.x = Math.random() * width; p.y = Math.random() * height; p.z = width; }
            const cx = width / 2;
            const cy = height / 2;
            const starX = (p.x - cx) * (width / p.z) + cx;
            const starY = (p.y - cy) * (width / p.z) + cy;
            const starSize = Math.max(0.1, p.size * (width / p.z));
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
            ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
            ctx.fill();
            break;

          case 'sakura':
            p.angle += p.spin;
            p.x += p.speedX + Math.sin(time * p.frequency) * p.amplitude;
            p.y += p.speedY;
            if (p.y > height + 20) { p.y = -20; p.x = Math.random() * width; }
            if (p.x > width + 20) p.x = -20;
            
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            // simple petal shape
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(p.size, -p.size, p.size*2, p.size, 0, p.size*2);
            ctx.bezierCurveTo(-p.size*2, p.size, -p.size, -p.size, 0, 0);
            ctx.fill();
            ctx.restore();
            break;

          case 'fireflies':
            p.angle += p.pulseSpeed;
            p.x += p.speedX;
            p.y += p.speedY;
            if (p.x < 0 || p.x > width) p.speedX *= -1;
            if (p.y < 0 || p.y > height) p.speedY *= -1;
            
            const currentOpacity = (Math.sin(p.angle) * 0.5 + 0.5) * p.opacity * intensity;
            ctx.beginPath();
            ctx.fillStyle = `rgba(180, 255, 100, ${currentOpacity})`;
            ctx.shadowBlur = 10 * intensity;
            ctx.shadowColor = 'rgba(180, 255, 100, 1)';
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            break;
        }
      });

      animationRef.current = requestAnimationFrame(render);
      } catch (err) {
        console.error('Canvas animation error:', err);
        animationRef.current = requestAnimationFrame(render);
      }
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [theme, intensity, enabled]);

  if (!enabled || !theme || theme === 'default') return null;

  return (
    <div className={`theme-renderer-layer theme-${theme}`}>
      {THEME_TYPES[theme] === 'particles' && (
        <canvas ref={canvasRef} className="theme-canvas" />
      )}
      {theme === 'ocean' && (
        <div className="theme-ocean-waves" style={{ opacity: intensity }}>
          <div className="wave wave1"></div>
          <div className="wave wave2"></div>
        </div>
      )}
      {theme === 'aurora' && (
        <div className="theme-aurora-glow" style={{ opacity: intensity }}>
          <div className="aurora-blob a1"></div>
          <div className="aurora-blob a2"></div>
          <div className="aurora-blob a3"></div>
        </div>
      )}
    </div>
  );
}
