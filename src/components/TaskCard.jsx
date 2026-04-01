import React from 'react';

function TaskCard({ task, users, onComplete, onEdit, onDelete, getNextAssignee }) {
  const now = new Date();
  const dueDate = task.nextDue ? new Date(task.nextDue) : null;
  
  const isOverdue = dueDate && dueDate < now && !task.completed;
  const isToday = dueDate && isToday_date(dueDate);

  const getFrequencyText = () => {
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

  const formatDate = (date) => {
    const options = { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric'
    };
    return date.toLocaleDateString('pt-BR', options);
  };

  const getDateClass = () => {
    if (isOverdue) return 'date-highlight date-overdue';
    if (isToday) return 'date-highlight date-today';
    return 'date-highlight date-future';
  };

  const dueDateText = dueDate ? formatDate(dueDate) : 'Sem prazo definido';

  function isToday_date(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  return (
    <div className={`task-card fade-in ${isOverdue ? 'overdue' : ''} ${task.completed ? 'completed' : ''}`}>
      <div className="task-header">
        <div className="task-title">{escapeHtml(task.name)}</div>
        <div className="task-assigned">{task.currentAssignee}</div>
      </div>
      
      <div className="task-details">
        <p><strong>Frequência:</strong> {getFrequencyText()}</p>
        <p><strong>Próximo vencimento:</strong> <span className={getDateClass()}>{dueDateText}</span></p>
        <p><strong>Participantes:</strong> {(task.participants || users).join(', ')}</p>
        {isOverdue && <p style={{ color: '#f44336', fontWeight: 'bold' }}>⚠️ ATRASADA!</p>}
        {isToday && <p style={{ color: '#2196F3', fontWeight: 'bold' }}>📅 VENCE HOJE!</p>}
        {task.completed && <p style={{ color: '#4CAF50', fontWeight: 'bold' }}>✅ CONCLUÍDA!</p>}
        {!task.completed && (
          <div className="next-assignee-indicator">
            Próximo responsável: {getNextAssignee(task)}
          </div>
        )}
      </div>
      
      <div className="task-actions">
        {!task.completed && (
          <button className="btn btn-complete" onClick={() => onComplete(task.id)}>
            Marcar como Concluída
          </button>
        )}
        <button className="btn btn-edit" onClick={() => onEdit(task)}>
          Editar Tarefa
        </button>
        <button className="btn btn-delete" onClick={() => onDelete(task.id)}>
          Excluir Tarefa
        </button>
      </div>
    </div>
  );
}

export default TaskCard;
