import React, { useState } from \'react\';
import { Header } from \'./components/Header\';
import { Icon } from \'./components/Icon\';
import { DaySummaryCard } from \'./components/DaySummaryCard\';
import { ShiftGrid } from \'./components/ShiftGrid\';
import { ActionToolbar } from \'./components/ActionToolbar\';
import { TeamView } from \'./components/TeamView\';
import { useSchedule } from \'./hooks/useSchedule\';
import { ConfirmationModal } from \'./components/ConfirmationModal\';

const App: React.FC = () => {
  const {
    employees,
    currentMY,
    selectedDayIdx,
    waModal,
    confirmationModal, 
    updateShift,
    updateEmployeeDailyHour,
    updateEmployeeDailyShiftName,
    resetMonth,
    generateNextMonth,
    shareWhatsApp,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    setSelectedDayIdx,
    navigateMonth,
    closeWaModal,
    openConfirmation,
    exportExcel,
    exportPDF,
    checkInterstice, // New
    validateSunday2x1 // New
  } = useSchedule();

  const [currentView, setCurrentView] = useState<'dashboard' | 'team'>('dashboard');

  return (
    <div className="min-h-screen flex flex-col">
      <Header currentView={currentView} onViewChange={setCurrentView} currentMY={currentMY} />
      
      {/* Confirmation Modal */}
      <ConfirmationModal 
        isOpen={confirmationModal.isOpen}
        onClose={confirmationModal.onClose}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={confirmationModal.confirmText}
        cancelText={confirmationModal.cancelText}
        type={confirmationModal.type}
        isAlert={confirmationModal.isAlert}
      />

      {waModal.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-xl font-extrabold flex items-center gap-2 text-slate-900"><Icon name="chat" className="text-green-600" /> Escala Diária</h4>
              <button onClick={closeWaModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Icon name="close" /></button>
            </div>
            <textarea readOnly className="w-full h-80 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium focus:ring-0 resize-none whitespace-pre-wrap outline-none text-slate-700" value={waModal.text} />
            <div className="mt-6 flex gap-3">
              <button onClick={() => { 
                navigator.clipboard.writeText(waModal.text); 
                openConfirmation({
                  title: \'Sucesso\',
                  message: \'Copiado para a área de transferência!\',
                  isAlert: true,
                  type: \'success\',
                  onConfirm: () => {}
                });
              }} className="flex-1 bg-green-600 text-white font-extrabold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-green-700 transition-all active:scale-95">
                <Icon name="content_copy" /> Copiar para WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-8 max-w-[1700px] mx-auto w-full">
        {currentView === \'dashboard\' ? (
          <>
            <div className="mb-8 animate-fade-in flex flex-col sm:flex-row sm:items-end justify-between gap-6 no-print">
              <div>
                <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight mb-2">Painel de <span className="text-orange-500">Escalas</span></h1>
                <p className="text-sm font-bold text-slate-400">Gerencie turnos, visualize presença e envie escalas diárias.</p>
              </div>
            </div>
            
            <div className="no-print">
                <DaySummaryCard 
                employees={employees} 
                selectedDayIdx={selectedDayIdx} 
                currentMY={currentMY} 
                />
            </div>

            <ActionToolbar 
                onExportExcel={exportExcel}
                onExportPDF={exportPDF}
                openConfirmation={openConfirmation}
            />

            <ShiftGrid 
              employees={employees} 
              currentMY={currentMY}
              selectedDayIdx={selectedDayIdx}
              onSelectDay={setSelectedDayIdx}
              onUpdateShift={updateShift} 
              onUpdateEmployeeDailyHour={updateEmployeeDailyHour}
              onUpdateEmployeeDailyShiftName={updateEmployeeDailyShiftName}
              onShareWhatsApp={shareWhatsApp}
              onGenerateNextMonth={generateNextMonth}
              onResetMonth={resetMonth}
              onNextMonth={() => navigateMonth(\'next\')}
              onPrevMonth={() => navigateMonth(\'prev\')}
              openConfirmation={openConfirmation}
              checkInterstice={checkInterstice}
              validateSunday2x1={validateSunday2x1}
            />
          </>
        ) : (
          <TeamView 
            employees={employees} 
            onUpdateEmployee={updateEmployee}
            onDeleteEmployee={deleteEmployee} 
            onAddEmployee={addEmployee}
            openConfirmation={openConfirmation}
          />
        )}
      </main>
    </div>
  );
};

export default App;
