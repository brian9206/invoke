import { useState } from 'react';
import { useRouter } from 'next/router';
import { ChevronDown, Folder, Server } from 'lucide-react';
import Modal from './Modal';

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
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; project: Project | null }>({
    isOpen: false,
    project: null,
  });

  const handleProjectSelect = (project: Project) => {
    // Only show confirmation if locked and switching to a different project
    if (isProjectLocked && activeProject?.id !== project.id) {
      setConfirmModal({ isOpen: true, project });
      return;
    }

    // Not locked, proceed directly
    onProjectChange(project);
    setProjectDropdownOpen(false);
  };

  const handleConfirmProjectChange = () => {
    if (confirmModal.project) {
      onProjectChange(confirmModal.project);
      setProjectDropdownOpen(false);
      router.push('/admin');
    }
    setConfirmModal({ isOpen: false, project: null });
  };

  const handleCancelProjectChange = () => {
    setConfirmModal({ isOpen: false, project: null });
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
    <>
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
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto animate-slideInUp">
              {userProjects.map((project, index) => (
                <button
                  key={project.id}
                  onClick={() => handleProjectSelect(project)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-600 transition-all flex items-center min-w-0 animate-fadeIn ${
                    activeProject?.id === project.id ? 'bg-gray-600' : ''
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
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

      <Modal
        isOpen={confirmModal.isOpen}
        title="Unsaved Changes"
        description="You have unsaved changes. Do you want to switch project and discard them?"
        onConfirm={handleConfirmProjectChange}
        onCancel={handleCancelProjectChange}
        cancelText="Cancel"
        confirmText="Switch Project"
        confirmVariant="danger"
      />
    </>
  );
}