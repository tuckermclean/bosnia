import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../home';
import { useCourses } from '@/hooks/useCourses';
import { useProgress } from '@/hooks/useProgress';
import type { Course } from '@/types/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/useCourses', () => ({ useCourses: jest.fn() }));
jest.mock('@/hooks/useProgress', () => ({ useProgress: jest.fn() }));

const mockedUseCourses = useCourses as jest.Mock;
const mockedUseProgress = useProgress as jest.Mock;

const baseQueryState = { isLoading: false, isError: false, data: undefined };

const sampleCourse: Course = {
  id: 'bs-a1-b2',
  language: 'bs',
  title: 'Bosnian A1-B2',
  units: [
    {
      id: 'a1-u1',
      level: 'A1',
      title: 'Jedinica 1',
      titleEn: 'Unit 1',
      theme: null,
      orderIndex: 0,
      skills: [],
    },
  ],
};

describe('HomeScreen', () => {
  beforeEach(() => {
    mockedUseCourses.mockReset();
    mockedUseProgress.mockReset();
    mockedUseProgress.mockReturnValue({ ...baseQueryState });
  });

  it('shows the empty state when the courses query succeeds with no courses', async () => {
    mockedUseCourses.mockReturnValue({ ...baseQueryState, data: [] });

    await render(<HomeScreen />);

    expect(screen.getByText('No lessons loaded yet')).toBeTruthy();
    expect(screen.getByText('Make sure the backend is running and seeded.')).toBeTruthy();
  });

  it('shows the empty state when the course has no units', async () => {
    mockedUseCourses.mockReturnValue({ ...baseQueryState, data: [{ ...sampleCourse, units: [] }] });

    await render(<HomeScreen />);

    expect(screen.getByText('No lessons loaded yet')).toBeTruthy();
  });

  it('does not show the empty state while loading', async () => {
    mockedUseCourses.mockReturnValue({ ...baseQueryState, isLoading: true, data: undefined });

    await render(<HomeScreen />);

    expect(screen.queryByText('No lessons loaded yet')).toBeNull();
  });

  it('does not show the empty state on error', async () => {
    mockedUseCourses.mockReturnValue({ ...baseQueryState, isError: true, data: undefined });

    await render(<HomeScreen />);

    expect(screen.queryByText('No lessons loaded yet')).toBeNull();
    expect(screen.getByText("Couldn't load your course. Pull to refresh soon.")).toBeTruthy();
  });

  it('renders the skill path (not the empty state) when a course with units is returned', async () => {
    mockedUseCourses.mockReturnValue({ ...baseQueryState, data: [sampleCourse] });

    await render(<HomeScreen />);

    expect(screen.queryByText('No lessons loaded yet')).toBeNull();
    expect(screen.getByText('Jedinica 1')).toBeTruthy();
  });
});
