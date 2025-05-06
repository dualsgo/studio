            }
         }
-    }, [toast, fetchSavedS
chedules]);
+    }, [toast, fetchSavedSchedules]);

     const handleLoadSchedule = useCallback(async (docId: string) => {
         await loadDataFromFirestore(docId, SAVED_SCHEDULES_COLLECTION);
@@ -516,7 +515,7 @@ export function ShiftMasterApp() {
      }
   }, [employeeToDelete, employees, schedule, toast]);

-
+  // Helper to check if a date is a holiday - Memoized version
   const isHoliday = useCallback((date: Date): boolean => {
     return isHolidayFn(holidays, date);
   }, [holidays]);
@@ -751,7 +750,7 @@ export function ShiftMasterApp() {
          filters={filters}
          employees={employees}
          roles={availableRoles} // Use imported availableRoles
-         onFilterChange={handleFilterChange}
+         onFilterChange={handleFilterChange} // Updated filters
       />

       {/* Month Navigation */}
