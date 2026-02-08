import React, { useState } from 'react';
import { INITIAL_USERS, MOCK_COURSES } from './constants';
import { User, Course } from './types';
import AuthView from './views/AuthView';
import DashboardView from './views/DashboardView'; // Student View
import InstructorDashboardView from './views/InstructorDashboardView'; // Instructor View
import InstructorPlanner from './views/InstructorPlanner';

// Simple Layout Wrapper
const SimpleLayout: React.FC<{ children: React.ReactNode; user: User | null; onLogout: () => void }> = ({ children, user, onLogout }) => (
  <div className="min-h-screen bg-slate-50 flex flex-col">
    {user && (
      <header className="bg-white shadow p-4 flex justify-between items-center z-10 relative">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
              {user.name.charAt(0)}
           </div>
           <span className="font-bold text-slate-700">{user.name} <span className="text-xs text-slate-400 font-normal">({user.role})</span></span>
        </div>
        <button onClick={onLogout} className="text-sm font-bold text-red-500 hover:text-red-700 transition-colors">Sign Out</button>
      </header>
    )}
    {children}
  </div>
);

function App() {
  // --- State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<string>('auth');
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES);

  // --- Actions ---

  const handleLogin = (email: string, pass: string) => {
    // 1. Find User in our Mock Data
    const user = INITIAL_USERS.find(u => u.email === email && u.password === pass);
    
    if (user) {
      setCurrentUser(user);
      
      // 2. STRICT ROLE REDIRECT
      // This is the critical fix:
      if (user.role === 'instructor') {
        setView('instructor-dashboard');
      } else {
        setView('dashboard'); // Forces students to the student view
      }
    } else {
      alert('Invalid Credentials.\n\nTry:\nadmin@msletb.ie / admin\nstudent@msletb.ie / student');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('auth');
  };

  // Mock Database Updates
  const handleUpdateCourse = (updatedCourse: Course) => {
    const updated = courses.map(c => c.id === updatedCourse.id ? updatedCourse : c);
    if (!courses.find(c => c.id === updatedCourse.id)) updated.push(updatedCourse);
    setCourses(updated);
  };

  const handleDeleteCourse = (courseId: string) => {
    if(confirm('Are you sure you want to delete this course?')) {
        setCourses(courses.filter(c => c.id !== courseId));
    }
  };

  const handleUnitComplete = (courseId: string, unitId: string, score: number) => {
    console.log(`Unit ${unitId} completed with score ${score}`);
    // Deep clone to simulate DB update
    const newCourses = JSON.parse(JSON.stringify(courses));
    // In a real app, we would find the unit and mark isCompleted = true here
    // For now, we just acknowledge the event
    setCourses(newCourses);
  };

  // --- View Routing ---
  const renderView = () => {
    switch (view) {
      case 'auth':
        return <AuthView onLogin={handleLogin} />;
      
      case 'instructor-dashboard':
        return (
          <InstructorDashboardView 
            courses={courses} 
            onSaveCourse={handleUpdateCourse}
            onDeleteCourse={handleDeleteCourse}
            onChangeView={setView} // Allows navigating to Planner
          />
        );

      case 'instructor-planner':
        return <InstructorPlanner onBack={() => setView('instructor-dashboard')} />;

      case 'dashboard': // The Student View
        return (
          <DashboardView 
            user={currentUser!} 
            courses={courses}
            onUnitComplete={handleUnitComplete}
          />
        );
        
      default:
        return <AuthView onLogin={handleLogin} />;
    }
  };

  return (
    <SimpleLayout user={currentUser} onLogout={handleLogout}>
      {renderView()}
    </SimpleLayout>
  );
}

export default App;