import React, { useState } from 'react';
import TaskDetailsModal from './TaskDetailsModal';

function TaskTable({ tasks, users, onCompleteTask, onEditTask, onDeleteTask, getNextAssignee }) {
  const [selectedTask, setSelectedTask] = useState(null);

  if (tasks.length === 0) {
    return (
      <div className="table-container-empty">
        <div className="loading">
          Nenhuma tarefa encontrada. Crie sua primeira tarefa!
        </div>
      </div>
    );
  }

  // Sort tasks by ID for consistent order
  const sortedTasks = [...tasks].sort((a, b) => {
    return (a.id || '').localeCompare(b.id || '');
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'Sem prazo';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const getFrequencyText = (task) => {
    switch (task.frequency) {
      case 'daily':
        return 'Diária';
      case 'weekly':
        return 'Semanal';
      case 'custom':
        return `A cada ${task.intervalDays} dias`;
      case 'none':
        return 'Sem prazo';
      default:
        return 'Não definida';
    }
  };

  const getDateClass = (dateString) => {
    if (!dateString) return 'date-future';
    const dueDate = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

    if (dueDateOnly < today) return 'date-overdue';
    if (dueDateOnly.toDateString() === today.toDateString()) return 'date-today';
    return 'date-future';
  };

  return (
    <div className="table-container">
      <div className="table-wrapper">
        <table className="task-table">
          <thead>
            <tr>
              <th>Responsável</th>
              <th>Próx. Vencimento</th>
              <th>Título</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map(task => (
              <tr key={task.id} className={`${task.completed ? 'completed' : ''} ${task.nextDue && new Date(task.nextDue) < new Date() && !task.completed ? 'overdue' : ''}`}>
                <td data-label="Responsável" className="owner-cell">
                  <span className="owner-badge">{task.currentAssignee}</span>
                </td>
                <td data-label="Próx. Vencimento" className="date-cell">
                  <span className={`date-badge ${getDateClass(task.nextDue)}`}>
                    {formatDate(task.nextDue)}
                  </span>
                </td>
                <td data-label="Título" className="title-cell">
                  <span className="cell-content task-title">{task.name}</span>
                </td>
                <td className="actions-cell">
                  <div className="action-buttons">
                    {!task.completed && (
                      <button
                        className="btn-table btn-complete"
                        onClick={() => onCompleteTask(task.id)}
                        title="Marcar como concluída"
                      >
                        ✓
                      </button>
                    )}
                    <button
                      className="btn-table btn-info"
                      onClick={() => setSelectedTask(task)}
                      title="Ver detalhes"
                    >
                      ℹ
                    </button>
                    <button
                      className="btn-table btn-edit"
                      onClick={() => onEditTask(task)}
                      title="Editar"
                    >
                      ✏
                    </button>
                    <button
                      className="btn-table btn-delete"
                      onClick={() => onDeleteTask(task.id)}
                      title="Excluir"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          getNextAssignee={getNextAssignee}
          users={users}
        />
      )}
    </div>
  );
}

export default TaskTable;
