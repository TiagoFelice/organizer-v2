import React, { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import TaskForm from './components/TaskForm';
import TaskList from './components/TaskList';
import EditModal from './components/EditModal';
import MessageAlert from './components/MessageAlert';
import { useLocalStorage } from './hooks/useLocalStorage';
import { firebaseInitialized } from './config/firebaseConfig';

const USERS = ['Tiago', 'Caio', 'Patinhas'];

function App() {
  const [tasks, setTasks] = useLocalStorage('organizer_tasks', []);
  const [message, setMessage] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ status: 'success', message: 'LocalStorage' });
  const [isLoading, setIsLoading] = useState(true);
  const unsubscribeRef = useRef(null);

  // Initialize app and set up Firestore listener (if available)
  useEffect(() => {
    const initializeApp = async () => {
      try {
        if (firebaseInitialized) {
          try {
            const { subscribeTasks } = await import('./services/firestoreService');
            setSyncStatus({ status: 'syncing', message: 'Sincronizando...' });
            
            // Subscribe to real-time updates from Firestore
            unsubscribeRef.current = subscribeTasks((firestoreTasks, error) => {
              if (error) {
                console.error('[DEBUG] Error listening to tasks:', error);
                setSyncStatus({ status: 'error', message: 'Erro ao sincronizar' });
                return;
              }
              
              if (firestoreTasks && firestoreTasks.length >= 0) {
                // Update both state and cache
                setTasks(firestoreTasks);
                setSyncStatus({ status: 'success', message: 'Sincronizado' });
              }
            });
          } catch (error) {
            console.warn('Firestore not available, using localStorage only:', error);
            setSyncStatus({ status: 'warning', message: 'LocalStorage' });
          }
        } else {
          setSyncStatus({ status: 'warning', message: 'LocalStorage' });
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing app:', error);
        setIsLoading(false);
      }
    };

    initializeApp();

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const showMessage = useCallback((text, type = 'info') => {
    setMessage({ text, type });
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, []);

  const createTask = useCallback(async (formData) => {
    let nextDue = null;
    let intervalDays = null;

    if (formData.frequency && formData.frequency !== 'none') {
      switch (formData.frequency) {
        case 'daily':
          intervalDays = 1;
          break;
        case 'weekly':
          intervalDays = 7;
          break;
        case 'custom':
          intervalDays = parseInt(formData.customDays);
          break;
      }

      if (intervalDays) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const nextDueDate = new Date(today.getTime() + intervalDays * 24 * 60 * 60 * 1000);
        nextDue = nextDueDate.toISOString();
      }
    }

    const newTask = {
      id: `task_${Date.now()}`,
      name: formData.taskName,
      frequency: formData.frequency || 'none',
      intervalDays: intervalDays,
      isRotating: true,
      participants: formData.participants.length > 0 ? formData.participants : USERS,
      currentAssignee: formData.participants.length > 0 ? formData.participants[0] : USERS[0],
      assigneeIndex: 0,
      lastCompleted: null,
      nextDue: nextDue,
      completed: false,
      completionHistory: []
    };

    try {
      setSyncStatus({ status: 'syncing', message: 'Salvando tarefa...' });
      // Update local state first
      setTasks(prev => [...prev, newTask]);
      
      // Try to sync to Firestore if available
      if (firebaseInitialized) {
        try {
          const { createTask: firestoreCreate } = await import('./services/firestoreService');
          const { id, ...taskData } = newTask;
          await firestoreCreate(id, taskData);
        } catch (error) {
          console.warn('Firestore sync failed, using localStorage:', error);
          setSyncStatus({ status: 'warning', message: 'LocalStorage' });
          return;
        }
      }
      
      showMessage('Tarefa criada com sucesso!', 'success');
      setSyncStatus({ status: 'success', message: 'Sincronizado' });
    } catch (error) {
      console.error('Error creating task:', error);
      showMessage('Erro ao criar tarefa', 'error');
    }
  }, [setTasks, showMessage]);

  const completeTask = useCallback(async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      showMessage('Tarefa não encontrada', 'error');
      return;
    }

    const taskParticipants = task.participants || USERS;
    let newAssigneeIndex = (task.assigneeIndex + 1) % taskParticipants.length;
    let newAssignee = taskParticipants[newAssigneeIndex];

    let nextDue = null;
    if (task.frequency && task.frequency !== 'none' && task.intervalDays) {
      const currentDueDate = new Date(task.nextDue);
      const now = new Date();

      const currentDueDateOnly = new Date(
        currentDueDate.getFullYear(),
        currentDueDate.getMonth(),
        currentDueDate.getDate()
      );
      const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let baseDate;
      if (currentDueDateOnly.getTime() < todayOnly.getTime()) {
        baseDate = todayOnly;
      } else {
        baseDate = currentDueDateOnly;
      }

      const nextDueDate = new Date(baseDate.getTime() + task.intervalDays * 24 * 60 * 60 * 1000);
      nextDue = nextDueDate.toISOString();
    }

    const completionRecord = {
      completedBy: task.currentAssignee,
      completedAt: new Date().toISOString()
    };

    const updatedHistory = task.completionHistory || [];
    updatedHistory.push(completionRecord);

    const updates = {
      completed: false,
      lastCompleted: new Date().toISOString(),
      nextDue: nextDue,
      currentAssignee: newAssignee,
      assigneeIndex: newAssigneeIndex,
      completionHistory: updatedHistory
    };

    try {
      setSyncStatus({ status: 'syncing', message: 'Atualizando...' });
      // Update local state first
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
      
      // Try to sync to Firestore if available
      if (firebaseInitialized) {
        try {
          const { updateTask: firestoreUpdate } = await import('./services/firestoreService');
          await firestoreUpdate(taskId, updates);
        } catch (error) {
          console.warn('Firestore sync failed, using localStorage:', error);
          setSyncStatus({ status: 'warning', message: 'LocalStorage' });
          showMessage(`Tarefa concluída! Próximo responsável: ${newAssignee}`, 'success');
          return;
        }
      }
      
      showMessage(`Tarefa concluída! Próximo responsável: ${newAssignee}`, 'success');
      setSyncStatus({ status: 'success', message: 'Sincronizado' });
    } catch (error) {
      console.error('Error completing task:', error);
      showMessage('Erro ao atualizar tarefa', 'error');
    }
  }, [tasks, setTasks, showMessage]);

  const deleteTask = useCallback(async (taskId) => {
    if (!window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
      return;
    }

    try {
      setSyncStatus({ status: 'syncing', message: 'Excluindo...' });
      // Update local state first
      setTasks(prev => prev.filter(t => t.id !== taskId));
      
      // Try to sync to Firestore if available
      if (firebaseInitialized) {
        try {
          const { deleteTask: firestoreDelete } = await import('./services/firestoreService');
          await firestoreDelete(taskId);
        } catch (error) {
          console.warn('Firestore sync failed, using localStorage:', error);
          setSyncStatus({ status: 'warning', message: 'LocalStorage' });
          showMessage('Tarefa excluída com sucesso!', 'success');
          return;
        }
      }
      
      showMessage('Tarefa excluída com sucesso!', 'success');
      setSyncStatus({ status: 'success', message: 'Sincronizado' });
    } catch (error) {
      console.error('Error deleting task:', error);
      showMessage('Erro ao excluir tarefa', 'error');
    }
  }, [setTasks, showMessage]);

  const updateTask = useCallback(async (taskId, updates) => {
    try {
      setSyncStatus({ status: 'syncing', message: 'Salvando...' });
      // Update local state first
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
      
      // Try to sync to Firestore if available
      if (firebaseInitialized) {
        try {
          const { updateTask: firestoreUpdate } = await import('./services/firestoreService');
          await firestoreUpdate(taskId, updates);
        } catch (error) {
          console.warn('Firestore sync failed, using localStorage:', error);
          setSyncStatus({ status: 'warning', message: 'LocalStorage' });
          showMessage('Tarefa atualizada com sucesso!', 'success');
          setEditingTask(null);
          return;
        }
      }
      
      showMessage('Tarefa atualizada com sucesso!', 'success');
      setSyncStatus({ status: 'success', message: 'Sincronizado' });
      setEditingTask(null);
    } catch (error) {
      console.error('Error updating task:', error);
      showMessage('Erro ao atualizar tarefa', 'error');
    }
  }, [setTasks, showMessage]);

  const getNextAssignee = (task) => {
    const taskParticipants = task.participants || USERS;
    const nextIndex = (task.assigneeIndex + 1) % taskParticipants.length;
    return taskParticipants[nextIndex];
  };

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>📋 Organizador de Tarefas Domésticas</h1>
          <p>Gerencie e organize as tarefas com rotação automática</p>
          <div className="sync-status" id="syncStatus">
            <span className="sync-indicator"></span>
            <span className="sync-text">{syncStatus.message}</span>
          </div>
        </header>

        <main className="main-content">
          {message && (
            <MessageAlert 
              text={message.text} 
              type={message.type}
              onClose={() => setMessage(null)}
            />
          )}

          <div className="content-wrapper">
            <section className="form-section">
              <TaskForm 
                users={USERS}
                onCreateTask={createTask}
              />
            </section>

            <section className="tasks-section">
              {isLoading ? (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <div className="loading-message">Inicializando sistema...</div>
                </div>
              ) : (
                <TaskList
                  tasks={tasks}
                  users={USERS}
                  onCompleteTask={completeTask}
                  onEditTask={setEditingTask}
                  onDeleteTask={deleteTask}
                  getNextAssignee={getNextAssignee}
                />
              )}
            </section>
          </div>
        </main>

        {editingTask && (
          <EditModal
            task={editingTask}
            users={USERS}
            onClose={() => setEditingTask(null)}
            onSave={(updates) => updateTask(editingTask.id, updates)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
