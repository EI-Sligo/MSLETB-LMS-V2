import { Course, User } from './types';

export const INITIAL_USERS: User[] = [
  {
    id: 'u_1',
    name: 'Declan (Instructor)',
    email: 'admin@msletb.ie',
    password: 'admin',
    role: 'instructor',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Declan'
  },
  {
    id: 'u_2',
    name: 'Alex (Apprentice)',
    email: 'student@msletb.ie', 
    password: 'student',       
    role: 'student',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex'
  }
];

export const MOCK_COURSES: Course[] = [
  {
    id: 'c_1',
    title: 'Phase 2 Electrical',
    description: 'Core electrical instrumentation principles and safety systems.',
    thumbnail_url: 'https://images.unsplash.com/photo-1498084393753-b411b2d26b34?auto=format&fit=crop&q=80&w=400',
    is_published: true,
    sections: [
      {
        id: 's_1',
        title: 'Module 1: Fundamentals',
        modules: [
          {
            id: 'm_1',
            title: 'Basic Electricity',
            units: [
              { id: 'u_1', title: 'Ohm\'s Law Theory', type: 'video', content: 'video_url', isCompleted: false },
              { id: 'u_2', title: 'Circuit Simulation', type: 'simulator', content: 'level_1', isCompleted: false },
              { id: 'u_3', title: 'Safety Quiz', type: 'quiz', content: 'quiz_data', isCompleted: false }
            ]
          }
        ]
      }
    ]
  }
];