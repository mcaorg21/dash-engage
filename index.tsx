
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';
import './index.css';

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('isLoggedIn') === 'true');
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('currentUser') || '');

  const handleLogin = (email: string, token: string) => {
    setIsLoggedIn(true);
    setCurrentUser(email);
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('currentUser', email);
    localStorage.setItem('authToken', token);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser('');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
  };

  return isLoggedIn
    ? <DashboardView user={currentUser} onLogout={handleLogout} />
    : <LoginView onLogin={handleLogin} />;
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
