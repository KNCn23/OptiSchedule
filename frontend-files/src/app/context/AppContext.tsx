import { AppProvider } from '@/app/context/AppProvider';
import { useTheme } from '@/app/context/ThemeContext';
import { useAuth } from '@/app/context/AuthContext';
import { useUI, type Filters } from '@/app/context/UIContext';
import { useScheduler } from '@/app/context/SchedulerContext';
import type { Account } from '@/app/features/auth/types/authTypes';

export type { Account, Filters };
export { AppProvider };

export function useApp() {
  const theme = useTheme();
  const auth = useAuth();
  const ui = useUI();
  const scheduler = useScheduler();

  return {
    ...theme,
    ...auth,
    ...ui,
    ...scheduler,
  };
}
