import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 20, g: 184, b: 166 };
}

function mixColors(c1, c2, weight) {
  const r = Math.round(c1.r * (1 - weight) + c2.r * weight);
  const g = Math.round(c1.g * (1 - weight) + c2.g * weight);
  const b = Math.round(c1.b * (1 - weight) + c2.b * weight);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function generateCustomThemeCSS(hex) {
  const base = hexToRgb(hex);
  const hoverHex = mixColors(base, { r: 0, g: 0, b: 0 }, 0.15);
  const black = { r: 0, g: 0, b: 0 };
  const darkBg = mixColors(black, base, 0.08);
  const white = { r: 255, g: 255, b: 255 };
  const lightBg = mixColors(white, base, 0.06);

  return `
    html[data-wallpaper='${hex}'] {
      --bg-app: ${darkBg}; --bg-sidebar: ${darkBg}; --bg-chat: ${darkBg};
      --accent-primary: ${hex}; --accent-primary-hover: ${hoverHex};
      --bg-msg-sent: ${hex}; --bg-msg-sent-hover: ${hoverHex};
      --shadow-glow: 0 0 20px rgba(${base.r}, ${base.g}, ${base.b}, 0.25);
      --unread-badge: ${hex};
    }
    html[data-theme='light'][data-wallpaper='${hex}'] {
      --bg-app: ${lightBg}; --bg-sidebar: ${lightBg}; --bg-chat: ${lightBg};
    }
  `;
}

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('zynk_theme') || 'dark';
  });

  const [wallpaper, setWallpaper] = useState(() => {
    return localStorage.getItem('zynk_wallpaper') || 'default';
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('zynk_sound_enabled') !== 'false';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zynk_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-wallpaper', wallpaper);
    localStorage.setItem('zynk_wallpaper', wallpaper);
    
    if (wallpaper.startsWith('#')) {
      let styleEl = document.getElementById('dynamic-theme');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-theme';
        document.head.appendChild(styleEl);
      }
      styleEl.innerHTML = generateCustomThemeCSS(wallpaper);
    }
  }, [wallpaper]);

  useEffect(() => {
    localStorage.setItem('zynk_sound_enabled', soundEnabled);
  }, [soundEnabled]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      toggleTheme, 
      setTheme,
      wallpaper, 
      setWallpaper, 
      soundEnabled, 
      setSoundEnabled 
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
