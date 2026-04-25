import React from 'react';

const Step = ({ label, icon, active }) => (
    <div style={{
        textAlign: 'center',
        flex: 1,
        opacity: active ? 1 : 0.3,
        transition: 'all 0.5s ease',
        transform: active ? 'scale(1.1)' : 'scale(1)'
    }}>
        <div style={{ fontSize: '2rem' }}>{icon}</div>
        <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#c9d1d9' }}>{label}</div>
    </div>
);

const Arrow = ({ active }) => (
    <div style={{
        fontSize: '1.5rem',
        color: active ? '#3fb950' : '#30363d',
        transition: 'color 0.3s ease',
        marginTop: '10px'
    }}>→</div>
);

export default function SystemFlow({ currentStage }) {
    // Stages: 0: Idle, 1: API, 2: RabbitMQ, 3: Worker, 4: DB/Success
    return (
        <div style={{
            backgroundColor: '#0d1117',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #30363d',
            margin: '20px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}>
            <Step label="Browser" icon="🌐" active={currentStage >= 0} />
            <Arrow active={currentStage >= 1} />
            <Step label="Node API" icon="⚡" active={currentStage >= 1} />
            <Arrow active={currentStage >= 2} />
            <Step label="RabbitMQ" icon="🐇" active={currentStage >= 2} />
            <Arrow active={currentStage >= 3} />
            <Step label="dotnet Worker" icon="⚙️" active={currentStage >= 3} />
            <Arrow active={currentStage >= 4} />
            <Step label="Postgres Shard" icon="🗄️" active={currentStage >= 4} />
        </div>
    );
}