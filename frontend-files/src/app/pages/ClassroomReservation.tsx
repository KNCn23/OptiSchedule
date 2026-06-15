import { useState } from 'react';
import { useApp } from '@/app/context/AppContext';
import { LoginScreen } from '@/app/features/auth/components/LoginScreen';
import { ReservationHome } from '@/app/features/reservations/components/ReservationHome';
import { ReservationNewChoice } from '@/app/features/reservations/components/ReservationNewChoice';
import { ReservationFilters } from '@/app/features/reservations/components/ReservationFilters';
import { ReservationResults } from '@/app/features/reservations/components/ReservationResults';
import { ReservationConfirmModal } from '@/app/features/reservations/components/ReservationConfirmModal';
import { ActiveReservations } from '@/app/features/reservations/components/ActiveReservations';
import { AllReservationsView } from '@/app/features/reservations/components/AllReservationsView';
import { ClassroomMatrixView } from '@/app/features/reservations/components/ClassroomMatrixView';
import type { ReservationView, ReservationFilterState, Room } from '@/app/features/reservations/types/reservationTypes';

export function ClassroomReservation() {
  const { darkMode, currentUser } = useApp();

  const [view, setView] = useState<ReservationView>('home');
  const [filters, setFilters] = useState<ReservationFilterState | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<(Room & { isAvailable: boolean }) | null>(null);

  // Guard: require login (non-student)
  if (!currentUser) {
    return <LoginScreen />;
  }

  function handleSearch(f: ReservationFilterState) {
    setFilters(f);
    setView('results');
  }

  function handleSelectRoom(room: Room & { isAvailable: boolean }) {
    if (room.isAvailable) {
      setSelectedRoom(room);
    }
  }

  function handleReserved() {
    // After successful reservation, refresh results
    setSelectedRoom(null);
    // Re-trigger results to refresh availability
    if (filters) {
      setFilters({ ...filters });
    }
  }

  function handleNavigate(v: ReservationView) {
    setView(v);
    if (v === 'home') {
      setFilters(null);
      setSelectedRoom(null);
    }
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >

      {/* View Router */}
      {view === 'home' && (
        <ReservationHome
          darkMode={darkMode}
          userRole={currentUser.role}
          onNavigate={handleNavigate}
        />
      )}

      {view === 'newChoice' && (
        <ReservationNewChoice
          darkMode={darkMode}
          onBack={() => handleNavigate('home')}
          onFilters={() => setView('filters')}
          onMatrix={() => setView('matrix')}
        />
      )}

      {view === 'filters' && (
        <ReservationFilters
          darkMode={darkMode}
          onSearch={handleSearch}
          onBack={() => handleNavigate('home')}
          onManualSearch={() => handleNavigate('matrix')}
        />
      )}

      {view === 'results' && filters && (
        <ReservationResults
          darkMode={darkMode}
          filters={filters}
          onBack={() => setView('filters')}
          onSelectRoom={handleSelectRoom}
        />
      )}

      {view === 'active' && (
        <ActiveReservations
          darkMode={darkMode}
          userId={String(currentUser.user_id)}
          onBack={() => handleNavigate('home')}
        />
      )}

      {view === 'allReservations' && (
        <AllReservationsView
          darkMode={darkMode}
          onBack={() => handleNavigate('home')}
        />
      )}

      {view === 'matrix' && (
        <ClassroomMatrixView
          darkMode={darkMode}
          onBack={() => handleNavigate('home')}
        />
      )}

      {/* Confirm Modal */}
      {selectedRoom && filters && (
        <ReservationConfirmModal
          darkMode={darkMode}
          room={selectedRoom}
          filters={filters}
          userId={String(currentUser.user_id)}
          userName={currentUser.full_name}
          userRole={currentUser.role}
          onClose={() => setSelectedRoom(null)}
          onReserved={handleReserved}
        />
      )}
    </div>
  );
}
