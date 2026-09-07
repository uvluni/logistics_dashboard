'use client';

import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import * as XLSX from 'xlsx';
import KPICard from '@/components/KPICard';
import DashboardSummary from '@/components/DashboardSummary';
import Navbar from '@/components/Navbar';
import { RouteKPI, DashboardSummary as Summary } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/i18n/translations';

function getTodayDate(): string {
  const date = new Date();
  return date.toISOString().split('T')[0];
}

function getNextBusinessDay(): string {
  let date = new Date();
  const today = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // If today is Thursday (4), Friday (5), or Saturday (6), jump to next Sunday
  // Otherwise advance by 1 day (including Sunday → Monday)
  if (today === 4 || today === 5 || today === 6) {
    // Calculate days until next Sunday
    const daysUntilNextSunday = (7 - today);
    date.setDate(date.getDate() + daysUntilNextSunday);
  } else {
    // Otherwise just go to next day (Sun→Mon, Mon→Tue, Tue→Wed, Wed→Thu)
    date.setDate(date.getDate() + 1);
  }

  return date.toISOString().split('T')[0];
}

function formatDateForDisplay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const shortYear = year.slice(-2);
  return `${day}/${month}/${shortYear}`;
}

export default function Home() {
  const { language, setLanguage, isRTL } = useLanguage();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    }
  };

  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    setTheme(savedTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [kpis, setKpis] = useState<RouteKPI[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [insights, setInsights] = useState('');
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [airtableRecords, setAirtableRecords] = useState<any[]>([]);
  const [showAirtable, setShowAirtable] = useState(false);
  const [loadingAirtable, setLoadingAirtable] = useState(false);
  const [airtableError, setAirtableError] = useState('');
  const [validatingRecordId, setValidatingRecordId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [validationType, setValidationType] = useState<'google' | 'rodnet' | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const datePickerRef = useRef<DatePicker>(null);
  const insightsRef = useRef<HTMLDivElement>(null);
  const airtableRef = useRef<HTMLDivElement>(null);

  const loadRoutes = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        sessionDate: selectedDate,
        language: language,
      });

      const res = await fetch(`/api/routes?${params}`, {
        credentials: 'include',
      });

      if (res.status === 401) {
        setIsLoggedIn(false);
        setError(t('error.session_expired', language));
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const details = errorData.details ? ` (routes: ${errorData.details.routesStatus}, equipment: ${errorData.details.equipmentStatus})` : '';
        setError(t('error.load_data_failed', language) + details);
        return;
      }

      const data = await res.json();
      setKpis(data.kpis || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(t('error.connection_failed', language));
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, language]);

  // Update HTML dir and lang based on language
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const htmlElement = document.documentElement;
      htmlElement.dir = language === 'he' ? 'rtl' : 'ltr';
      htmlElement.lang = language;
    }
  }, [language]);

  // Initialize date on client only to avoid hydration mismatch
  useEffect(() => {
    setSelectedDate(getTodayDate());
    setMounted(true);
    // Don't restore selectedIntegration - force user to choose on login
  }, []);

  // Reset date to today when logged in
  useEffect(() => {
    if (isLoggedIn) {
      setSelectedDate(getTodayDate());
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && selectedIntegration && selectedDate) {
      loadRoutes();
    }
  }, [selectedDate, isLoggedIn, selectedIntegration, loadRoutes]);

  // Regenerate insights when language changes (only if already generated once)
  useEffect(() => {
    if (insights && kpis.length > 0) {
      handleGenerateInsights();
    }
  }, [language]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError(t('auth.missing_credentials', language));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Get CSRF token first
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      if (!csrfRes.ok) {
        setError(t('auth.connection_error', language));
        setIsLoading(false);
        return;
      }

      const csrfData = await csrfRes.json();
      const csrfToken = csrfData.token;

      // Login with real ROADNET credentials
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (res.ok) {
        setIsLoggedIn(true);
        setPassword(''); // Clear password after successful login
        // Don't load routes here - wait for integration selection first
      } else {
        setError(t('auth.error', language));
      }
    } catch (err) {
      setError(t('auth.connection_error', language));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoggedIn(false);
    setSelectedIntegration(null);
    setKpis([]);
    setSummary(null);
    setPassword('');
  }

  function handleSelectIntegration(integration: string) {
    setSelectedIntegration(integration);
    localStorage.setItem('selectedIntegration', integration);
  }

  function handleBackToIntegrations() {
    setSelectedIntegration(null);
    localStorage.removeItem('selectedIntegration');
  }

  async function handleDownloadReport() {
    if (!selectedDate) {
      setError(t('error.select_date_first', language));
      return;
    }

    try {
      const params = new URLSearchParams({
        sessionDate: selectedDate,
        language: language,
      });

      const res = await fetch(`/api/routes?${params}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        setError(t('error.download_failed', language));
        return;
      }

      const data = await res.json();

      // Create Excel file from KPI data
      const kpis = data.kpis || [];

      // Prepare data for Excel
      const excelData = kpis.map((kpi: RouteKPI) => ({
        'Route ID': kpi.routeId,
        'Driver Name': kpi.driverName,
        'Vehicle Type': kpi.vehicleType,
        'Total Duration (min)': kpi.totalDurationMinutes,
        'Travel Time (min)': kpi.travelTimeMinutes,
        'Service Time (min)': kpi.serviceTimeMinutes,
        'Stops': kpi.stopCount,
        'Rounds': kpi.rounds?.length || 0,
        'Total Weight (kg)': kpi.totalWeight,
        'Vehicle Capacity (kg)': kpi.vehicleCapacity,
        'Weight Utilization (%)': kpi.weightUtilization,
        'Time Utilization (%)': kpi.timeUtilization,
        'Insights': kpi.insights?.join('; ') || '',
      }));

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Routes');

      // Set column widths
      const colWidths = [
        { wch: 12 }, // Route ID
        { wch: 15 }, // Driver Name
        { wch: 15 }, // Vehicle Type
        { wch: 16 }, // Total Duration
        { wch: 14 }, // Travel Time
        { wch: 14 }, // Service Time
        { wch: 8 },  // Stops
        { wch: 14 }, // Total Weight
        { wch: 16 }, // Vehicle Capacity
        { wch: 16 }, // Weight Utilization
        { wch: 14 }, // Time Utilization
        { wch: 40 }, // Insights
        { wch: 8 },  // Rounds
      ];
      worksheet['!cols'] = colWidths;

      // Download file
      XLSX.writeFile(workbook, `routes-report-${selectedDate}.xlsx`);
    } catch (err) {
      setError(t('error.download_failed', language));
    }
  }

  async function handleDownloadStopsReport() {
    if (!selectedDate) {
      setError(t('error.select_date_first', language));
      return;
    }

    try {
      const params = new URLSearchParams({
        sessionDate: selectedDate,
      });

      const res = await fetch(`/api/stops?${params}`, {
        credentials: 'include',
      });

      if (res.status === 401) {
        setError(t('error.session_expired', language));
        setIsLoggedIn(false);
        return;
      }

      if (!res.ok) {
        setError(t('error.download_failed', language));
        return;
      }

      const data = await res.json();

      // Helper functions for formatting
      const formatAddress = (address: string) => {
        // Replace multiple consecutive spaces with single space
        return (address || '').replace(/\s+/g, ' ').trim();
      };

      const formatTime = (timestamp: string) => {
        // Extract time in HH:MM format from ISO timestamp like "2026-07-02T06:35:47.191"
        if (!timestamp) return '';
        const match = timestamp.match(/T(\d{2}):(\d{2})/);
        return match ? `${match[1]}:${match[2]}` : '';
      };

      // Extract stops data from ROADNET API response
      const routes = data.items || data.routes || data.data || [];
      const stopsData: any[] = [];

      routes.forEach((route: any) => {
        const routeId = route.identity?.identifier || '';
        const workerFirstName = route.workersInfo?.[0]?.name?.firstName || '';
        const equipmentIdentifier = route.equipmentInfo?.[0]?.specificEquipmentInfo?.identity?.identifier || '';
        let routeStopNumber = 0;

        // Process each ServiceableStop in the route (excluding depot stops)
        if (route.stops && Array.isArray(route.stops)) {
          route.stops.forEach((stop: any) => {
            // Only include ServiceableStop, not DEPOT or MidrouteDepotStop
            if (stop.stopType === 'ServiceableStop') {
              routeStopNumber++;
              const ssi = stop.serviceableStopInfo || {};
              const locationInfo = ssi.locationInfo || {};
              const address = locationInfo.address || {};

              stopsData.push({
                'Route ID': routeId,
                'Session Date': selectedDate,
                'Worker First Name': workerFirstName,
                'Equipment Identifier': equipmentIdentifier,
                'Location Identifier': locationInfo.identity?.identifier || '',
                'Location Description': locationInfo.description || '',
                'Address Line 1': formatAddress(address.addressLine1),
                'State Or Province': address.stateOrProvince || '',
                'Stop Number': routeStopNumber,
                'Arrival Timestamp': formatTime(ssi.arrivalTimestamp),
                'Departure Timestamp': formatTime(ssi.departureTimestamp),
                'Total Delivery Quantities': ssi.totalDeliveryQuantities?.[0] || 0,
              });
            }
          });
        }
      });

      // Create Excel workbook
      const worksheet = XLSX.utils.json_to_sheet(stopsData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stops');

      // Set column widths
      const colWidths = [
        { wch: 15 }, // Route ID
        { wch: 13 }, // Session Date
        { wch: 15 }, // Worker First Name
        { wch: 18 }, // Equipment Identifier
        { wch: 18 }, // Location Identifier
        { wch: 20 }, // Location Description
        { wch: 18 }, // Address Line 1
        { wch: 16 }, // State Or Province
        { wch: 12 }, // Stop Number
        { wch: 20 }, // Arrival Timestamp
        { wch: 20 }, // Departure Timestamp
        { wch: 14 }, // Total Delivery Quantities
      ];
      worksheet['!cols'] = colWidths;

      // Download file
      XLSX.writeFile(workbook, `stops-report-${selectedDate}.xlsx`);
    } catch (err) {
      setError(t('error.download_failed', language));
    }
  }

  async function handleDownloadOrdersReport() {
    if (!selectedDate) {
      setError(t('error.select_date_first', language));
      return;
    }

    try {
      const params = new URLSearchParams({
        sessionDate: selectedDate,
      });

      const res = await fetch(`/api/stops?${params}`, {
        credentials: 'include',
      });

      if (res.status === 401) {
        setError(t('error.session_expired', language));
        setIsLoggedIn(false);
        return;
      }

      if (!res.ok) {
        setError(t('error.download_failed', language));
        return;
      }

      const data = await res.json();

      // Helper functions for formatting
      const formatAddress = (address: string) => {
        return (address || '').replace(/\s+/g, ' ').trim();
      };

      const formatTime = (timestamp: string) => {
        if (!timestamp) return '';
        const match = timestamp.match(/T(\d{2}):(\d{2})/);
        return match ? `${match[1]}:${match[2]}` : '';
      };

      // Extract orders data from ROADNET API response
      const routes = data.items || data.routes || data.data || [];
      const ordersData: any[] = [];

      routes.forEach((route: any) => {
        const routeId = route.identity?.identifier || '';
        const workerFirstName = route.workersInfo?.[0]?.name?.firstName || '';
        const equipmentIdentifier = route.equipmentInfo?.[0]?.specificEquipmentInfo?.identity?.identifier || '';

        if (route.stops && Array.isArray(route.stops)) {
          let routeStopNumber = 0;
          route.stops.forEach((stop: any) => {
            if (stop.stopType === 'ServiceableStop') {
              routeStopNumber++;
              const ssi = stop.serviceableStopInfo || {};
              const locationInfo = ssi.locationInfo || {};
              const address = locationInfo.address || {};
              const orders = ssi.orders || [];

              orders.forEach((order: any) => {
                ordersData.push({
                  'Route ID': routeId,
                  'Session Date': selectedDate,
                  'Worker First Name': workerFirstName,
                  'Equipment Identifier': equipmentIdentifier,
                  'Location Identifier': locationInfo.identity?.identifier || '',
                  'Location Description': locationInfo.description || '',
                  'Address Line 1': formatAddress(address.addressLine1),
                  'State Or Province': address.stateOrProvince || '',
                  'Stop Number': routeStopNumber,
                  'Arrival Timestamp': formatTime(ssi.arrivalTimestamp),
                  'Departure Timestamp': formatTime(ssi.departureTimestamp),
                  'Order Identifier': order.identity?.identifier || '',
                  'Total Delivery Quantities': order.totalDeliveryQuantities?.[0] || 0,
                });
              });
            }
          });
        }
      });

      // Create Excel workbook
      const worksheet = XLSX.utils.json_to_sheet(ordersData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');

      // Set column widths
      const colWidths = [
        { wch: 15 }, // Route ID
        { wch: 13 }, // Session Date
        { wch: 15 }, // Worker First Name
        { wch: 18 }, // Equipment Identifier
        { wch: 18 }, // Location Identifier
        { wch: 20 }, // Location Description
        { wch: 18 }, // Address Line 1
        { wch: 16 }, // State Or Province
        { wch: 12 }, // Stop Number
        { wch: 20 }, // Arrival Timestamp
        { wch: 20 }, // Departure Timestamp
        { wch: 18 }, // Order Identifier
        { wch: 14 }, // Total Delivery Quantities
      ];
      worksheet['!cols'] = colWidths;

      // Download file
      XLSX.writeFile(workbook, `orders-report-${selectedDate}.xlsx`);
    } catch (err) {
      setError(t('error.download_failed', language));
    }
  }

  async function handleGenerateInsights() {
    if (!selectedDate) {
      setInsightsError(t('error.select_date_first', language));
      return;
    }

    if (kpis.length === 0) {
      setInsightsError(t('dashboard.no_routes_message', language));
      return;
    }

    setGeneratingInsights(true);
    setInsightsError('');
    setInsights('');

    try {
      // Prepare routes data as Excel format
      const routesData = kpis.map(kpi => ({
        'Route ID': kpi.routeId,
        'Driver Name': kpi.driverName,
        'Vehicle Type': kpi.vehicleType,
        'Total Duration (min)': kpi.totalDurationMinutes,
        'Travel Time (min)': kpi.travelTimeMinutes,
        'Service Time (min)': kpi.serviceTimeMinutes,
        'Stops': kpi.stopCount,
        'Rounds': kpi.rounds?.length || 0,
        'Total Weight (kg)': kpi.totalWeight,
        'Vehicle Capacity (kg)': kpi.vehicleCapacity,
        'Weight Utilization (%)': kpi.weightUtilization,
        'Time Utilization (%)': kpi.timeUtilization,
      }));

      // Fetch stops data for additional insights
      let stopsData: any[] = [];
      try {
        const stopsRes = await fetch(`/api/stops?sessionDate=${selectedDate}`, {
          credentials: 'include',
        });
        if (stopsRes.ok) {
          const stopsRawData = await stopsRes.json();
          const routes = stopsRawData.items || stopsRawData.routes || [];
          routes.forEach((route: any) => {
            const routeId = route.identity?.identifier || '';
            if (route.stops && Array.isArray(route.stops)) {
              let stopNumber = 0;
              route.stops.forEach((stop: any) => {
                if (stop.stopType === 'ServiceableStop') {
                  stopNumber++;
                  const ssi = stop.serviceableStopInfo || {};
                  const locationInfo = ssi.locationInfo || {};
                  const address = locationInfo.address || {};
                  stopsData.push({
                    'Route ID': routeId,
                    'Stop Number': stopNumber,
                    'Location Description': locationInfo.description || '',
                    'Address': address.addressLine1 || '',
                    'City': address.stateOrProvince || '',
                    'Total Delivery Quantities': ssi.totalDeliveryQuantities?.[0] || 0,
                  });
                }
              });
            }
          });
        }
      } catch (err) {
        // Continue without stops data if fetch fails
      }

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          routesData,
          stopsData: stopsData.length > 0 ? stopsData : undefined,
          language,
        }),
      });

      if (res.status === 401) {
        setIsLoggedIn(false);
        setError(t('error.session_expired', language));
        return;
      }

      if (!res.ok) {
        setInsightsError(t('dashboard.insights_no_key', language));
        return;
      }

      const data = await res.json();
      setInsights(data.insights || '');

      // Scroll to insights after data is received, accounting for sticky header
      setTimeout(() => {
        const element = insightsRef.current;
        if (element) {
          const headerOffset = 100;
          const elementPosition = element.getBoundingClientRect().top + window.scrollY;
          const offsetPosition = elementPosition - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 100);
    } catch (err) {
      setInsightsError(t('dashboard.insights_no_key', language));

      // Scroll to insights section even on error
      setTimeout(() => {
        insightsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } finally {
      setGeneratingInsights(false);
    }
  }

  async function handleLoadAirtable() {
    setLoadingAirtable(true);
    setAirtableError('');

    try {
      const res = await fetch('/api/airtable', {
        credentials: 'include',
      });

      if (!res.ok) {
        // Show error message and scroll to section
        setAirtableError(t('dashboard.geocode_no_key', language));
        setShowAirtable(true);

        // Scroll to airtable section even on error
        setTimeout(() => {
          airtableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        return;
      }

      const data = await res.json();
      setAirtableRecords(data.records || []);
      setShowAirtable(true);

      // Scroll to airtable section on success
      setTimeout(() => {
        airtableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setAirtableError(t('dashboard.geocode_no_key', language));
      setShowAirtable(true);

      // Scroll to airtable section even on exception
      setTimeout(() => {
        airtableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } finally {
      setLoadingAirtable(false);
    }
  }

  async function handleAcceptGoogle(recordId: string, address: string) {
    setValidatingRecordId(recordId);
    setValidationType('google');
    setValidationMessage('');

    try {
      const res = await fetch('/api/airtable', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, field: 'Choose Google coordinates' }),
        credentials: 'include',
      });

      if (!res.ok) {
        setValidationMessage('שגיאה בעדכון הרשומה');
        return;
      }

      // Remove the validated record from display if both fields are true
      setAirtableRecords(prev => prev.map(r =>
        r.id === recordId
          ? { ...r, fields: { ...r.fields, 'Choose Google coordinates': true } }
          : r
      ));

      // Show success message
      setValidationMessage(t('validation.google_accepted', language));

      // Auto-clear message after 3 seconds
      setTimeout(() => setValidationMessage(''), 3000);
    } catch (err) {
      setValidationMessage('שגיאה בעדכון הרשומה');
    } finally {
      setValidatingRecordId(null);
      setValidationType(null);
    }
  }

  async function handleAcceptRodnet(recordId: string, address: string) {
    setValidatingRecordId(recordId);
    setValidationType('rodnet');
    setValidationMessage('');

    try {
      const res = await fetch('/api/airtable', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, field: 'Choose Roadnet coordinates' }),
        credentials: 'include',
      });

      if (!res.ok) {
        setValidationMessage('שגיאה בעדכון הרשומה');
        return;
      }

      // Remove the validated record from display if both fields are true
      setAirtableRecords(prev => prev.map(r =>
        r.id === recordId
          ? { ...r, fields: { ...r.fields, 'Choose Roadnet coordinates': true } }
          : r
      ));

      // Show success message
      setValidationMessage(t('validation.rodnet_accepted', language));

      // Auto-clear message after 3 seconds
      setTimeout(() => setValidationMessage(''), 3000);
    } catch (err) {
      setValidationMessage('שגיאה בעדכון הרשומה');
    } finally {
      setValidatingRecordId(null);
      setValidationType(null);
    }
  }

  if (!isLoggedIn || !mounted) {
    return (
      <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', zIndex: 10, padding: '16px 32px', direction: 'ltr' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--color-green, #10b981)' }}>
                {/* Outer circle */}
                <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="32"/>
                {/* Three arrows in clockwise pattern */}
                {/* Top right arrow */}
                <g transform="translate(100, 100) rotate(0)">
                  <path d="M 0 -60 L 35 -20 L 20 0 L -20 0 L -35 -20 Z" fill="currentColor"/>
                </g>
                {/* Bottom right arrow */}
                <g transform="translate(100, 100) rotate(120)">
                  <path d="M 0 -60 L 35 -20 L 20 0 L -20 0 L -35 -20 Z" fill="currentColor"/>
                </g>
                {/* Left arrow */}
                <g transform="translate(100, 100) rotate(240)">
                  <path d="M 0 -60 L 35 -20 L 20 0 L -20 0 L -35 -20 Z" fill="currentColor"/>
                </g>
              </svg>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Integration Layer</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setLanguage('he')} style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: language === 'he' ? 'var(--color-blue)' : 'var(--border-primary)', color: language === 'he' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
              עב
            </button>
            <button onClick={() => setLanguage('en')} style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: language === 'en' ? 'var(--color-blue)' : 'var(--border-primary)', color: language === 'en' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
              EN
            </button>
            <button onClick={() => setLanguage('es')} style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: language === 'es' ? 'var(--color-blue)' : 'var(--border-primary)', color: language === 'es' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
              ES
            </button>
            <button onClick={toggleTheme} style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 600, backgroundColor: '#e5e7eb', color: '#6b7280', border: 'none', cursor: 'pointer', fontSize: '18px', display: 'inline-block', minWidth: '40px', textAlign: 'center' }} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, padding: '16px' }}>
          <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-primary)', maxWidth: '420px', width: '100%', padding: '40px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '6px', letterSpacing: '-0.5px' }}>
            {t('app.title', language)}
          </h1>
          <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: '32px', fontSize: '13px', fontWeight: 400 }}>
            {t('app.subtitle', language)}
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: isRTL ? 'right' : 'left' }}>
            {error && (
              <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: '6px' }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, marginBottom: '6px', textAlign: isRTL ? 'right' : 'left' }}>
                {t('auth.email', language)}
              </label>
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-primary)', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px', textAlign: isRTL ? 'right' : 'left', transition: 'border-color 0.2s' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, marginBottom: '6px', textAlign: isRTL ? 'right' : 'left' }}>
                {t('auth.password', language)}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-primary)', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '14px', textAlign: isRTL ? 'right' : 'left', transition: 'border-color 0.2s' }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{ width: '100%', backgroundColor: isLoading ? 'var(--text-tertiary)' : 'var(--color-blue)', color: 'white', fontWeight: 500, padding: '10px', borderRadius: '4px', transition: 'all 0.2s', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1, fontSize: '14px' }}
            >
              {isLoading ? t('auth.connecting', language) : t('auth.login', language)}
            </button>
          </form>
        </div>
        </div>
      </div>
    );
  }

  // Integrations Hub screen
  if (!selectedIntegration) {
    const integrations = [
      {
        id: 'roadnet',
        name: language === 'he' ? 'ROADNET' : 'ROADNET',
        description: language === 'he' ? 'מערכת ניהול מסלולים וחלוקה' : 'Route planning & distribution system',
        icon: '🚚',
        color: '#3b82f6',
      },
      {
        id: 'logistics',
        name: language === 'he' ? 'לוגיסטיקה' : 'Logistics',
        description: language === 'he' ? 'ניהול חלוקה מתקדם' : 'Advanced delivery management',
        icon: '📦',
        color: '#10b981',
      },
      {
        id: 'analytics',
        name: language === 'he' ? 'ניתוח' : 'Analytics',
        description: language === 'he' ? 'דוחות ותחזוקות' : 'Reports & forecasting',
        icon: '📊',
        color: '#8b5cf6',
      },
    ];

    return (
      <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', zIndex: 10, padding: '16px 32px', direction: 'ltr' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--color-green, #10b981)' }}>
                {/* Outer circle */}
                <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="32"/>
                {/* Three arrows in clockwise pattern */}
                {/* Top right arrow */}
                <g transform="translate(100, 100) rotate(0)">
                  <path d="M 0 -60 L 35 -20 L 20 0 L -20 0 L -35 -20 Z" fill="currentColor"/>
                </g>
                {/* Bottom right arrow */}
                <g transform="translate(100, 100) rotate(120)">
                  <path d="M 0 -60 L 35 -20 L 20 0 L -20 0 L -35 -20 Z" fill="currentColor"/>
                </g>
                {/* Left arrow */}
                <g transform="translate(100, 100) rotate(240)">
                  <path d="M 0 -60 L 35 -20 L 20 0 L -20 0 L -35 -20 Z" fill="currentColor"/>
                </g>
              </svg>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Integration Layer</h2>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setLanguage('he')} style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: language === 'he' ? 'var(--color-blue)' : 'var(--border-primary)', color: language === 'he' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
              עב
            </button>
            <button onClick={() => setLanguage('en')} style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: language === 'en' ? 'var(--color-blue)' : 'var(--border-primary)', color: language === 'en' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
              EN
            </button>
            <button onClick={() => setLanguage('es')} style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: language === 'es' ? 'var(--color-blue)' : 'var(--border-primary)', color: language === 'es' ? 'white' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
              ES
            </button>
            <button onClick={toggleTheme} style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 600, backgroundColor: '#e5e7eb', color: '#6b7280', border: 'none', cursor: 'pointer', fontSize: '18px', display: 'inline-block', minWidth: '40px', textAlign: 'center' }} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button onClick={handleLogout} style={{ padding: '8px 16px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: '#dc2626', color: 'white', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
              {t('auth.logout', language)}
            </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, padding: '32px 16px' }}>
          <div style={{ maxWidth: '900px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', letterSpacing: '-0.5px' }}>
              {language === 'he' ? 'Integration Layer' : language === 'es' ? 'Integration Layer' : 'Integration Layer'}
            </h1>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '15px', fontWeight: 400 }}>
              {language === 'he' ? 'בחר את המערכת בה ברצונך להשתמש' : language === 'es' ? 'Elige el sistema que deseas usar' : 'Choose the system you want to use'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {integrations.map((integration) => (
              <button
                key={integration.id}
                onClick={() => {
                  if (integration.id === 'roadnet') {
                    handleSelectIntegration(integration.id);
                  } else {
                    setToastMessage(language === 'he' ? 'נדרש מפתח אינטגרציה' : 'Integration key required');
                    setTimeout(() => setToastMessage(''), 3000);
                  }
                }}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '2px solid var(--border-primary)',
                  borderRadius: '8px',
                  padding: '32px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '16px',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  const target = e.currentTarget as HTMLButtonElement;
                  target.style.borderColor = integration.color;
                  target.style.boxShadow = `0 0 20px ${integration.color}20`;
                  target.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  const target = e.currentTarget as HTMLButtonElement;
                  target.style.borderColor = 'var(--border-primary)';
                  target.style.boxShadow = 'none';
                  target.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ fontSize: '48px' }}>{integration.icon}</div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {integration.name}
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    {integration.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
        </div>

        {/* Toast notification */}
        {toastMessage && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--color-blue)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            animation: 'fadeInUp 0.3s ease-out',
            fontWeight: 500
          }}>
            {toastMessage}
          </div>
        )}
        <style>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateX(-50%) translateY(0);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <Navbar />
      <div style={{ position: 'sticky', top: 60, backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', zIndex: 9, padding: '8px 32px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
        <button onClick={handleLogout} style={{ padding: '8px 16px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s', backgroundColor: '#dc2626', color: 'white', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
          {t('auth.logout', language)}
        </button>
      </div>

      <div style={{ maxWidth: '100%', margin: '0 auto', padding: '32px' }}>
        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-primary)', padding: '32px', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', color: 'var(--text-primary)', textAlign: isRTL ? 'right' : 'left' }}>{t('dashboard.planning_header', language)} - {selectedDate ? formatDateForDisplay(selectedDate) : '...'}</h2>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '12px', color: 'var(--text-primary)', textAlign: isRTL ? 'right' : 'left' }}>
              {t('dashboard.select_date', language)}
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div
                onClick={() => datePickerRef.current?.setOpen(true)}
                style={{ backgroundColor: 'white', cursor: 'pointer', borderRadius: '6px', padding: '8px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', minWidth: '160px', pointerEvents: 'auto' }}
                suppressHydrationWarning
              >
                <span className="text-2xl">📅</span>
                {selectedDate && (
                  <DatePicker
                    ref={datePickerRef}
                    selected={new Date(selectedDate + 'T00:00:00')}
                    onChange={(date: Date | null) => {
                      if (date) {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        setSelectedDate(`${year}-${month}-${day}`);
                      }
                    }}
                    onSelect={() => {
                      setTimeout(() => {
                        datePickerRef.current?.setOpen(false);
                      }, 0);
                    }}
                    dateFormat="dd/MM/yy"
                    className="border-0 bg-transparent text-gray-900 font-semibold text-lg focus:outline-none"
                    wrapperClassName="flex-1"
                  />
                )}
              </div>
              <button onClick={handleDownloadReport} style={{ backgroundColor: '#16a34a', color: 'white', fontWeight: 600, padding: '8px 16px', borderRadius: '6px', transition: 'all 0.2s', fontSize: '14px', whiteSpace: 'nowrap', border: 'none', cursor: 'pointer' }}>
                {t('dashboard.report_routes', language)}
              </button>
              <button onClick={handleDownloadStopsReport} style={{ backgroundColor: '#16a34a', color: 'white', fontWeight: 600, padding: '8px 16px', borderRadius: '6px', transition: 'all 0.2s', fontSize: '14px', whiteSpace: 'nowrap', border: 'none', cursor: 'pointer' }}>
                {t('dashboard.report_stops', language)}
              </button>
              <button onClick={handleDownloadOrdersReport} style={{ backgroundColor: '#16a34a', color: 'white', fontWeight: 600, padding: '8px 16px', borderRadius: '6px', transition: 'all 0.2s', fontSize: '14px', whiteSpace: 'nowrap', border: 'none', cursor: 'pointer' }}>
                {t('dashboard.report_orders', language)}
              </button>
              <button
                onClick={handleGenerateInsights}
                disabled={generatingInsights}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                {t('dashboard.generate_insights_button', language)}
              </button>
              <button
                onClick={handleLoadAirtable}
                disabled={loadingAirtable}
                className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                {t('dashboard.geocode_report_button', language)}
              </button>
            </div>
          </div>
        </div>

        <div className="fade-in-up">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-8">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="text-center text-gray-500 py-12">{t('dashboard.loading_summary', language)}</div>
          )}

          {summary && kpis.length > 0 && (
            <div className="fade-in-up">
              <DashboardSummary summary={summary} normalWorkDayMinutes={kpis[0]?.normalWorkDayMinutes} />

              {generatingInsights && (
                <div className="text-center text-gray-400 text-sm py-2 fade-in-up">{t('dashboard.generating_insights', language)}</div>
              )}

              {insightsError && !generatingInsights && (
                <div className="text-center text-gray-400 text-sm py-2 fade-in-up">{insightsError}</div>
              )}

              {insights && (
                <div ref={insightsRef} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }} className={`border rounded-lg p-6 mb-8 ${isRTL ? 'text-right' : 'text-left'}`}>
                  <h3 style={{ color: 'var(--text-primary)' }} className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span>🤖</span>
                    {t('dashboard.insights_title', language)}
                  </h3>
                  <div style={{ color: 'var(--text-secondary)' }} className={`whitespace-pre-wrap leading-relaxed text-sm ${isRTL ? 'text-right' : 'text-left'}`}>
                    {insights}
                  </div>
                </div>
              )}

              <Suspense fallback={<div className="text-center text-gray-500">{t('dashboard.loading_routes', language)}</div>}>
                <div className="mb-8">
                  <h2 className={`text-2xl font-bold text-gray-900 mb-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                    {t('kpi.title', language)}
                  </h2>

                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {kpis.map((kpi) => (
                      <KPICard key={kpi.routeId} kpi={kpi} />
                    ))}
                  </div>
                </div>
              </Suspense>
            </div>
          )}

          {summary && kpis.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <p className="text-gray-600 text-lg">{t('dashboard.no_routes_message', language)}</p>
            </div>
          )}

          {!summary && isLoggedIn && !error && !isLoading && (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <p className={`text-gray-600 text-lg ${isRTL ? 'text-right' : 'text-left'}`}>
                {t('dashboard.loading_message', language)}{selectedDate}...
              </p>
            </div>
          )}
        </div>

        {loadingAirtable && (
          <div className="text-center text-gray-400 text-sm py-2 fade-in-up">{t('dashboard.loading_addresses', language)}</div>
        )}

        {airtableError && !loadingAirtable && (
          <div className="text-center text-gray-400 text-sm py-2 fade-in-up">{airtableError}</div>
        )}

        <div ref={airtableRef} className={`overflow-hidden transition-all duration-300 ${showAirtable && airtableRecords.length > 0 && !isLoading ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="py-8 airtable-entrance">
            <div style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-primary)' }} className={`border rounded-lg p-6 mb-8 ${isRTL ? 'text-right' : 'text-left'}`}>
              <div className="flex justify-between items-center mb-6">
                <h3 style={{ color: 'var(--text-primary)' }} className="text-2xl font-bold">
                  📍 {t('dashboard.address_verification', language)} ({airtableRecords.filter(r => !r.fields?.['Choose Google coordinates'] && !r.fields?.['Choose Roadnet coordinates']).length})
                </h3>
                <button
                  onClick={() => setShowAirtable(false)}
                  style={{ color: 'var(--text-secondary)' }}
                  className="hover:opacity-70 font-bold text-xl"
                >
                  ✕
                </button>
              </div>
              {validationMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {validationMessage}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="px-4 py-3 font-semibold text-gray-900 text-right">{t('table.city', language)}</th>
                      <th className="px-4 py-3 font-semibold text-gray-900 text-right">{t('table.street', language)}</th>
                      <th className="px-4 py-3 font-semibold text-gray-900 text-center">{t('table.score', language)}</th>
                      <th className="px-4 py-3 font-semibold text-gray-900 text-right">{t('table.reason', language)}</th>
                      <th className="px-4 py-3 font-semibold text-gray-900 text-center">{t('table.validation', language)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {airtableRecords
                      .filter(record => !record.fields?.['Choose Google coordinates'] && !record.fields?.['Choose Roadnet coordinates'])
                      .map((record) => {
                        const fields = record.fields || {};
                        const recommendation = fields['Geocode Recommendation'];
                        const address = fields['Address Line 1'] || '-';
                        const city = fields['City'] || '-';
                        const reason = fields['Reason'] || '-';
                        const score = recommendation ? parseInt(recommendation) : 1;

                        return {
                          record,
                          score,
                          address,
                          city,
                          recommendation,
                          reason,
                        };
                      })
                      .sort((a, b) => b.score - a.score)
                      .map(({ record, score, address, city, recommendation, reason }) => {
                        let bgColor = 'bg-green-50';
                        let scoreBg = 'bg-green-100';
                        let scoreText = 'text-green-900';
                        let scoreLabel = t('score.valid', language);

                        if (recommendation === '3') {
                          bgColor = 'bg-red-50';
                          scoreBg = 'bg-red-100';
                          scoreText = 'text-red-900';
                          scoreLabel = t('score.needs_fixing', language);
                        } else if (recommendation === '2') {
                          bgColor = 'bg-yellow-50';
                          scoreBg = 'bg-yellow-100';
                          scoreText = 'text-yellow-900';
                          scoreLabel = t('score.consider', language);
                        }

                        return (
                          <tr key={record.id} className={`border-b border-gray-100 ${bgColor}`}>
                            <td className="px-4 py-3 text-gray-900 font-bold text-right">{city}</td>
                            <td className="px-4 py-3 text-gray-900 font-medium text-right">{address}</td>
                            <td className={`px-4 py-3 text-center font-semibold`}>
                              <span className={`px-3 py-1 rounded-full text-sm ${scoreBg} ${scoreText}`}>
                                {scoreLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700 text-right text-xs leading-relaxed max-w-xs">{reason}</td>
                            <td className="px-4 py-3 text-center gap-2 flex justify-center">
                              <button
                                onClick={() => handleAcceptGoogle(record.id, address)}
                                disabled={validatingRecordId === record.id}
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold px-3 py-1 rounded transition-colors text-sm"
                              >
                                {validatingRecordId === record.id && validationType === 'google' ? t('validation.saving', language) : t('validation.accept_google', language)}
                              </button>
                              <button
                                onClick={() => handleAcceptRodnet(record.id, address)}
                                disabled={validatingRecordId === record.id}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold px-3 py-1 rounded transition-colors text-sm"
                              >
                                {validatingRecordId === record.id && validationType === 'rodnet' ? t('validation.saving', language) : t('validation.accept_rodnet', language)}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll to top button */}
        {(summary || insights || showAirtable) && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-blue)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 40,
              transition: 'opacity 0.3s',
              opacity: 0.5,
              boxShadow: 'none'
            }}
            onMouseEnter={(e) => (e.target as HTMLElement).style.opacity = '1'}
            onMouseLeave={(e) => (e.target as HTMLElement).style.opacity = '0.5'}
            title="Scroll to top"
          >
            ↑
          </button>
        )}

      </div>
    </div>
  );
}
