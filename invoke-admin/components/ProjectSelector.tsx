import { useState } from 'react';
import { useRouter } from 'next/router';
import { ChevronDown, Folder, Server } from 'lucide-react';
import Modal from './Modal';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';

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
    if (isProjectLocked && activeProject?.id !== project.id) {
      setConfirmModal({ isOpen: true, project });
      return;
    }
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
    return <div className="h-10 bg-muted animate-pulse rounded-md" />;
  }

  if (userProjects.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-2">
        {user.isAdmin ? 'No projects found' : 'No projects assigned'}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <Button
          variant="outline"
          onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
          className="w-full justify-between px-3 h-9 bg-sidebar-accent border-sidebar-border hover:bg-sidebar-accent/80 hover:border-sidebar-border text-sidebar-foreground"
        >
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            {activeProject?.id === 'system' ? (
              <Server className="w-4 h-4 text-primary shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-primary shrink-0" />
            )}
            <span className="text-sm font-medium truncate">
              {activeProject ? activeProject.name : 'Select Project'}
            </span>
          </div>
          <ChevronDown className={cn(
            'w-4 h-4 text-muted-foreground shrink-0 transition-transform',
            projectDropdownOpen && 'rotate-180'
          )} />
        </Button>

        {projectDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setProjectDropdownOpen(false)}
            />
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-20 overflow-hidden animate-in fade-in-0 zoom-in-95">
              <ScrollArea className="max-h-64">
                {userProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleProjectSelect(project)}
                    className={cn(
                      'w-full px-3 py-2.5 text-left flex items-center space-x-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                      activeProject?.id === project.id && 'bg-accent text-accent-foreground'
                    )}
                  >
                    {project.id === 'system' ? (
                      <Server className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-primary shrink-0" />
                    )}
                    <span className="truncate font-medium">{project.name}</span>
                  </button>
                ))}
              </ScrollArea>
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
