import React from 'react';
import { ThemeProvider } from '@/app/context/ThemeContext';
import { AuthProvider } from '@/app/context/AuthContext';
import { UIProvider } from '@/app/context/UIContext';
import { SchedulerProvider } from '@/app/context/SchedulerContext';

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UIProvider>
          <SchedulerProvider>
            {children}
          </SchedulerProvider>
        </UIProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
