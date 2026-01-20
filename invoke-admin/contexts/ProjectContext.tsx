import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authenticatedFetch } from '@/lib/frontend-utils';
import { useAuth } from '@/contexts/AuthContext';

interface Project {
  id: string;
  name: string;
  description: string;
  role?: string;
}

interface ProjectContextType {
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  userProjects: Project[];
  loading: boolean;
  isProjectLocked: boolean;
  lockProject: (project: Project) => void;
  unlockProject: () => void;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);  const [isProjectLocked, setIsProjectLocked] = useState(false)
  const [lockedProject, setLockedProject] = useState<Project | null>(null)
  const systemProject: Project = {
    id: 'system',
    name: 'System',
    description: 'System-wide administration',
    role: 'admin',
  };

  const refreshProjects = async () => {
    if (!user) {
      setUserProjects([]);
      setActiveProject(null);
      setLoading(false);
      return;
    }

    try {
      // Admin users get all projects, regular users get their assigned projects
      const endpoint = user.isAdmin ? '/api/admin/projects' : '/api/my-projects';
      const response = await authenticatedFetch(endpoint);
      let projects = [];
      if (response.ok) {
        const data = await response.json();
        if (user.isAdmin) {
          projects = data?.projects || [];
        } else {
          // `/api/my-projects` may return either an array or an object containing `projects`.
          projects = Array.isArray(data) ? data : (data?.projects || []);
        }
        // For admins, add System project at the top
        if (user.isAdmin) {
          projects = [systemProject, ...(projects || [])];
        }
        setUserProjects(projects || []);
        // Always select the first project by default
        if (projects && projects.length > 0) {
          // Check if current active project is still in the list
          const currentProjectStillExists = activeProject && projects.find(p => p.id === activeProject.id);
          if (!currentProjectStillExists) {
            setActiveProject(projects[0]);
          }
        } else {
          setActiveProject(null);
        }
      } else {
        console.error('Failed to load projects');
        setUserProjects([]);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      setUserProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshProjects();
  }, [user]);

  // Store active project in localStorage
  useEffect(() => {
    if (activeProject) {
      localStorage.setItem('activeProjectId', activeProject.id);
    } else {
      localStorage.removeItem('activeProjectId');
    }
  }, [activeProject]);

  // Restore active project from localStorage on mount
  useEffect(() => {
    const savedProjectId = localStorage.getItem('activeProjectId');
    if (savedProjectId && userProjects.length > 0 && !activeProject) {
      const savedProject = userProjects.find(p => p.id === savedProjectId);
      if (savedProject) {
        setActiveProject(savedProject);
      }
    }
  }, [userProjects]);

  const lockProject = useCallback((project: Project) => {
    setIsProjectLocked(true)
    setLockedProject(project)
    setActiveProject(project)
  }, [])

  const unlockProject = useCallback(() => {
    setIsProjectLocked(false)
    setLockedProject(null)
    // Restore previous active project from localStorage if available
    const savedProjectId = localStorage.getItem('activeProjectId')
    if (savedProjectId && userProjects.length > 0) {
      const savedProject = userProjects.find(p => p.id === savedProjectId)
      if (savedProject) {
        setActiveProject(savedProject)
      } else if (userProjects.length > 0) {
        setActiveProject(userProjects[0])
      }
    } else if (userProjects.length > 0) {
      setActiveProject(userProjects[0])
    }
  }, [userProjects])

  // Override setActiveProject to respect locking
  const handleSetActiveProject = useCallback((project: Project | null) => {
    if (isProjectLocked) {
      return // Don't allow project changes when locked
    }
    setActiveProject(project)
    if (project) {
      localStorage.setItem('activeProjectId', project.id)
    } else {
      localStorage.removeItem('activeProjectId')
    }
  }, [isProjectLocked])

  return (
    <ProjectContext.Provider value={{
      activeProject: isProjectLocked ? lockedProject : activeProject,
      setActiveProject: handleSetActiveProject,
      userProjects,
      loading,
      isProjectLocked,
      lockProject,
      unlockProject,
      refreshProjects
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}