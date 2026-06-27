import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

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
