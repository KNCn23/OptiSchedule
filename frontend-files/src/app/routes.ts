import { createBrowserRouter } from 'react-router';
import { Root } from '@/app/pages/Root';
import { Landing } from '@/app/pages/Landing';
import { AdminDashboard } from '@/app/pages/AdminDashboard';
import { AcademicView } from '@/app/pages/AcademicView';
import { CourseCatalog } from '@/app/pages/CourseCatalog';
import { ClassroomReservation } from '@/app/pages/ClassroomReservation';
import { Reports } from '@/app/pages/Reports';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: Landing },
      { path: 'admin', Component: AdminDashboard },
      { path: 'academic', Component: AcademicView },
      { path: 'reservations', Component: ClassroomReservation },
      { path: 'courses', Component: CourseCatalog },
      { path: 'reports', Component: Reports },
    ],
  },
]);
