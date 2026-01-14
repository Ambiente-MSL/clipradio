
import React from 'react';
import { motion } from 'framer-motion';
import { Filter, ListFilter, CalendarDays, MapPin } from 'lucide-react';

const GravacoesFilter = ({ filters, setFilters, radios }) => {
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="card p-6 mb-10">
      <h2 className="text-2xl font-bold text-foreground flex items-center mb-5"><Filter className="w-6 h-6 mr-3 text-purple-400" />Filtros</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <label htmlFor="filterRadio" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por rádio</label>
          <div className="relative">
            <select
              id="filterRadio"
              name="radioId"
              className="input appearance-none pr-10"
              value={filters.radioId}
              onChange={handleFilterChange}
            >
              <option value="all">Todas as rádios</option>
              {radios.map((radio) => (
                <option key={radio.id} value={radio.id}>{radio.nome}</option>
              ))}
            </select>
            <ListFilter className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label htmlFor="filterDate" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por data</label>
          <div className="relative">
            <input
              id="filterDate"
              name="data"
              type="date"
              value={filters.data}
              onChange={handleFilterChange}
              className="input appearance-none pr-10"
            />
            <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label htmlFor="filterCidade" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por cidade</label>
          <div className="relative">
            <input
              id="filterCidade"
              name="cidade"
              type="text"
              placeholder="Digite a cidade..."
              value={filters.cidade}
              onChange={handleFilterChange}
              className="input pr-10"
            />
            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label htmlFor="filterEstado" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por estado</label>
          <div className="relative">
            <input
              id="filterEstado"
              name="estado"
              type="text"
              placeholder="Digite o estado (UF)..."
              value={filters.estado}
              onChange={handleFilterChange}
              className="input pr-10"
            />
            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default GravacoesFilter;
