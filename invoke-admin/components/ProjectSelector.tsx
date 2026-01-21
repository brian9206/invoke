import { useState } from 'react';
import { useRouter } from 'next/router';
import { ChevronDown, Folder, Server } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  role?: string;
}

interface User {
  isAdmin: boolean;
}

interface ProjectSelectorProps {
  activeProject: Project | null;
  userProjects: Project[];
  loading: boolean;
  isProjectLocked: boolean;
  user: User;
  onProjectChange: (project: Project) => void;
}

export default function ProjectSelector({
  activeProject,
  userProjects,
  loading,
  isProjectLocked,
  user,
  onProjectChange,
}: ProjectSelectorProps) {
  const router = useRouter();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  const handleProjectSelect = (project: Project) => {
    // Only show confirmation if locked and switching to a different project
    if (isProjectLocked && activeProject?.id !== project.id) {
      const confirmed = confirm('You have unsaved changes. Switch project and return to dashboard?');
      if (confirmed) {
        onProjectChange(project);
        setProjectDropdownOpen(false);
        router.push('/admin');
      }
      // If cancelled, dropdown stays open
      return;
    }

    // Not locked, proceed directly
    onProjectChange(project);
    setProjectDropdownOpen(false);
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (userProjects.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-2">
        {user.isAdmin ? 'No projects found' : 'No projects assigned'}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
        className="w-full flex items-center justify-between p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors min-w-0"
      >
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          {activeProject?.id === 'system' ? (
            <Server className="w-4 h-4 text-primary-400 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-primary-400 flex-shrink-0" />
          )}
          <div className="text-left min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">
              {activeProject ? activeProject.name : 'Select Project'}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transform transition-transform flex-shrink-0 ${
          projectDropdownOpen ? 'rotate-180' : ''
        }`} />
      </button>

      {projectDropdownOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setProjectDropdownOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
            {userProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleProjectSelect(project)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-600 transition-colors flex items-center min-w-0 ${
                  activeProject?.id === project.id ? 'bg-gray-600' : ''
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  {project.id === 'system' ? (
                    <Server className="w-4 h-4 text-primary-400 flex-shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-primary-400 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">
                      {project.name}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}