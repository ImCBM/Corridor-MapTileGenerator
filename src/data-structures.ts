export class Point {
    constructor(public x: number, public y: number) {}
}

export class Edge {
    constructor(public p: Point, public q: Point) {}
}

export class PathNode {
    public f: number;

    constructor(
        public position: [number, number],
        public parent: PathNode | null,
        public g: number,
        public h: number
    ) {
        this.f = g + h;
    }

    equals(other: PathNode): boolean {
        return this.position[0] === other.position[0] && this.position[1] === other.position[1];
    }

    getKey(): string {
        return `${this.position[0]},${this.position[1]}`;
    }
}

export class IntGrid {
    private grid: number[][];

    constructor(public width: number, public height: number) {
        this.grid = Array(width).fill(null).map(() => Array(height).fill(0));
    }

    setTile(x: number, y: number, tileType: number): void {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            this.grid[x][y] = tileType;
        }
    }

    getTile(x: number, y: number): number {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            return this.grid[x][y];
        }
        return 0;
    }

    display(): void {
        console.log('Grid Display:');
        for (let y = this.height - 1; y >= 0; y--) {
            let row = '';
            for (let x = 0; x < this.width; x++) {
                const tile = this.grid[x][y];
                if (tile === 1) {
                    row += '.';
                } else if (tile === 2) {
                    row += '#';
                } else if (tile === 3) {
                    row += 'O';
                } else {
                    row += ' ';
                }
            }
            console.log(row);
        }
    }
}