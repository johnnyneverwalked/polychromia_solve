import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'NumberNgFor' })
export class NumberNgForPipe implements PipeTransform {
    transform(num: number) {
        return Array(num > 0 ? num : 0);
    }
}
