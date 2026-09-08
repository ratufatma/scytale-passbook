export function shortHash(value: string): string {
    return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

export function formatQuanta(value: number): string {
    return value.toLocaleString('en-US');
}

export function formatSCY(value: number): string {
    return value.toFixed(8);
}
