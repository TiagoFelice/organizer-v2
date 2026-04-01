import React from 'react';

function TaskDetailsModal({ task, onClose, getNextAssignee, users }) {
  const formatDate = (dateString) => {
    if (!dateString) return 'Não definido';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

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

  const isOverdue = task.nextDue && new Date(task.nextDue) < new Date() && !task.completed;
  const isToday = task.nextDue && new Date(task.nextDue).toDateString() === new Date().toDateString();

  return (
    <div className="modal">
      <div className="modal-content task-details-modal">
        <div className="modal-header">
          <h2>Detalhes da Tarefa</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="detail-section">
            <h3>Título</h3>
            <p className="detail-value">{task.name}</p>
          </div>

          <div className="detail-section">
            <h3>Frequência</h3>
            <p className="detail-value">{getFrequencyText()}</p>
          </div>

          <div className="detail-section">
            <h3>Responsável Atual</h3>
            <div className="detail-value owner-badge">{task.currentAssignee}</div>
          </div>

          <div className="detail-section">
            <h3>Próximo Responsável</h3>
            <p className="detail-value">{getNextAssignee(task)}</p>
          </div>

          <div className="detail-section">
            <h3>Próximo Vencimento</h3>
            <p className={`detail-value date-badge ${isOverdue ? 'date-overdue' : isToday ? 'date-today' : 'date-future'}`}>
              {formatDate(task.nextDue)}
            </p>
            {isOverdue && <p style={{ color: '#f44336', fontWeight: 'bold', marginTop: '8px' }}>⚠️ ATRASADA!</p>}
            {isToday && <p style={{ color: '#2196F3', fontWeight: 'bold', marginTop: '8px' }}>📅 VENCE HOJE!</p>}
          </div>

          <div className="detail-section">
            <h3>Participantes</h3>
            <div className="participants-list-view">
              {(task.participants || users).map((participant, index) => (
                <div key={index} className="participant-badge">
                  {participant}
                </div>
              ))}
            </div>
          </div>

          {task.lastCompleted && (
            <div className="detail-section">
              <h3>Última Conclusão</h3>
              <p className="detail-value">{formatDate(task.lastCompleted)}</p>
            </div>
          )}

          {task.completionHistory && task.completionHistory.length > 0 && (
            <div className="detail-section">
              <h3>Histórico de Conclusões</h3>
              <div className="completion-history">
                {task.completionHistory.slice(-5).reverse().map((completion, index) => (
                  <div key={index} className="history-item">
                    <span className="history-date">{formatDate(completion.date)}</span>
                    <span className="history-by">por {completion.completedBy || 'Desconhecido'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {task.completed && (
            <div className="detail-section">
              <p style={{ color: '#4CAF50', fontWeight: 'bold', textAlign: 'center' }}>✅ TAREFA CONCLUÍDA!</p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailsModal;
