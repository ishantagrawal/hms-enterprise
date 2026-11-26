import { useEffect } from 'react';

export default function usePortalBackNavigation(page, setPage) {
  useEffect(() => {
    const handleBack = (event) => {
      if (page !== 'home') {
        setPage('home');
        event.preventDefault();
      }
    };
    window.addEventListener('vidyut-native-back', handleBack);
    return () => window.removeEventListener('vidyut-native-back', handleBack);
  }, [page, setPage]);
}
