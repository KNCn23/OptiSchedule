import { useState, useMemo } from 'react';
import { Course } from '@/app/data/mockData';
import { useApp } from '@/app/context/AppContext';

export type DepartmentFilter = string;

export function useCourseFilters(courses: Course[]) {
  const { currentUser } = useApp();
  // Dept-locked roles (secretary / coordinator) are pinned to their own department.
  const isDeptScoped = currentUser?.role === 'secretary' || currentUser?.role === 'coordinator';
  const secretaryDept = currentUser?.department_name || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentFilter>(isDeptScoped ? secretaryDept : '');
  const [selectedClass, setSelectedClass] = useState<string>('');

  const departments = useMemo(() => {
    if (isDeptScoped) return [{ value: secretaryDept, label: secretaryDept }];
    const uniqueDepts = Array.from(new Set(courses.map(c => c.department).filter(Boolean)));
    return uniqueDepts.map(dept => ({ value: dept, label: dept }));
  }, [courses, isDeptScoped, secretaryDept]);

  const classOptions = useMemo(() => {
    // If a department is selected, only show classes for courses in that department
    const relevantCourses = selectedDepartment 
      ? courses.filter(c => c.department === selectedDepartment)
      : courses;
      
    const uniqueClasses = Array.from(new Set(relevantCourses.map(c => c.classLevel).filter(Boolean)));
    return uniqueClasses.map(cls => ({ value: cls, label: cls }));
  }, [courses, selectedDepartment]);

  const handleDepartmentChange = (dept: DepartmentFilter) => {
    setSelectedDepartment(dept);
    setSelectedClass(''); // Reset class when department changes
  };

  const filterCourses = (coursesToFilter: Course[]) => {
    return coursesToFilter.filter(course => {
      let passSearch = true;
      let passDept = true;
      let passClass = true;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        passSearch = 
          course.name.toLowerCase().includes(query) ||
          course.code.toLowerCase().includes(query) ||
          course.lecturer.toLowerCase().includes(query);
      }

      if (isDeptScoped && secretaryDept) {
        passDept = course.department === secretaryDept;
      } else if (selectedDepartment) {
        passDept = course.department === selectedDepartment;
      }

      if (selectedClass) {
        passClass = course.classLevel === selectedClass;
      }

      if (!searchQuery && !selectedDepartment) {
        return true;
      }

      return passSearch && passDept && (!selectedClass || passClass);
    });
  };

  return {
    searchQuery,
    setSearchQuery,
    selectedDepartment,
    handleDepartmentChange,
    selectedClass,
    setSelectedClass,
    departments,
    classOptions,
    filterCourses,
  };
}
