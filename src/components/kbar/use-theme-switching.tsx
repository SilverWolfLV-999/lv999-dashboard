import { useRegisterActions } from 'kbar';
import { useTheme } from 'next-themes';
import { useThemeConfig } from '@/components/themes/active-theme';
import { THEMES } from '@/components/themes/theme.config';

const useThemeSwitching = () => {
  const { theme, setTheme } = useTheme();
  const { activeTheme, setActiveTheme } = useThemeConfig();

  const toggleDarkLight = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const cycleTheme = () => {
    const currentIndex = THEMES.findIndex((t) => t.value === activeTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setActiveTheme(THEMES[nextIndex].value);
  };

  const themeActions = [
    {
      id: 'cycleTheme',
      name: '切换主题',
      shortcut: ['t', 't'],
      keywords: 'switch theme cycle',
      section: '主题',
      perform: cycleTheme
    },
    {
      id: 'toggleDarkLight',
      name: '切换深色/浅色模式',
      shortcut: ['d', 'd'],
      keywords: 'toggle dark light mode',
      section: '主题',
      perform: toggleDarkLight
    },
    {
      id: 'setLightTheme',
      name: '切换为浅色主题',
      keywords: 'set light theme',
      section: '主题',
      perform: () => setTheme('light')
    },
    {
      id: 'setDarkTheme',
      name: '切换为深色主题',
      keywords: 'set dark theme',
      section: '主题',
      perform: () => setTheme('dark')
    }
  ];

  useRegisterActions(themeActions, [theme, activeTheme]);
};

export default useThemeSwitching;
