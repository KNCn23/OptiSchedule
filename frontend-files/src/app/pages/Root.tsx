import { Outlet } from 'react-router';
import { AppProvider } from '@/app/context/AppContext';
import { LocaleProvider } from '@/app/i18n';
import { Header } from '@/app/shared/components/Header';

export function Root() {
  return (
    <LocaleProvider>
      <AppProvider>
        <div className="h-screen flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
            <Outlet />
          </main>
        </div>
      </AppProvider>
    </LocaleProvider>
  );
}
